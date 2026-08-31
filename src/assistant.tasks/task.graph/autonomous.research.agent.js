import { StateGraph, END } from "@langchain/langgraph";
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import searchTool from "../../config/scraper.config.js";
import { searchDuckDuckGo } from "../../config/duckduckgo.config.js";
import researchThink from "../../prompts/research.think.prompt.js";
import redisClient from "../../config/redis.config.js";
import GetChatHistory from "../../db.tasks/chat.get.app.js";
import SaveChat from "../../db.tasks/chat.save.app.js";
import createLogger from "../../utils/logger.js";
import { MAX_RESEARCH_STEPS, REDIS_RESEARCH_TTL } from "../../config/constants.js";

const log = createLogger("RESEARCH");
const SEARCH_CACHE_KEY = "synchora:research_cache";

// ---------------- THINK NODE ----------------

async function thinkNode(state) {
  log.info("Analyzing search history and context...");

  try {
    const history = await redisClient.get(SEARCH_CACHE_KEY);
    const recentChatsDoc = await GetChatHistory();
    const recentChats = recentChatsDoc?.chats || recentChatsDoc || [];

    let formattedHistory = "No search history available.";
    if (history) {
      try {
        const parsed = JSON.parse(history);
        formattedHistory = parsed
          .map((d) => `Query: ${d.query}\nResults: ${JSON.stringify(d.results).slice(0, 1200)}\nTime: ${d.time}`)
          .join("\n\n");
      } catch {
        formattedHistory = history;
      }
    }

    let formattedChats = "No recent chats available.";
    if (recentChats && recentChats.length) {
      formattedChats = recentChats
        .slice(-8)
        .map((c) => `${c.role}: ${c.message}`)
        .join("\n");
    }

    const prompt = await researchThink.format({
      userQuery: state.userQuery,
      recentChats: formattedChats,
      searchHistory: formattedHistory,
      allowHTML: state.allowHTML,
    });

    const res = await GeminiMainModel.invoke(prompt);
    const cleaned = res.content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      log.error("JSON parse failed on research think node output");
      return {
        ...state,
        done: true,
        finalAnswer: "I couldn't process the research results.",
      };
    }

    if (parsed.found) {
      log.info("Answer resolved from current knowledge context");
      await SaveChat({
        role: "synchora",
        message: parsed.answer,
        intent: state.intent,
        confidence: state.confidence,
      });

      return {
        ...state,
        finalAnswer: parsed.answer,
        done: true,
      };
    }

    if ((state.searchCount || 0) >= MAX_RESEARCH_STEPS) {
      log.warn("Search limit reached. Returning best available answer.");
      const fallbackAnswer =
        parsed.answer || "I gathered some information but could not perform further web searches.";
      return {
        ...state,
        finalAnswer: fallbackAnswer,
        done: true,
      };
    }

    log.info(`Web search required. Augmented query: "${parsed.preSearchAugmentedQuery}"`);
    return {
      ...state,
      augmentedQuery: parsed.preSearchAugmentedQuery,
      searchCount: (state.searchCount || 0) + 1,
      done: false,
    };
  } catch (error) {
    log.error("Research thinking node failed:", error.message);
    return {
      ...state,
      done: true,
      finalAnswer: "Research module encountered an internal error.",
    };
  }
}

// ---------------- SEARCH NODE (SERP API + DUCKDUCKGO FALLBACK) ----------------

async function searchNode(state) {
  // Save user chat message on the very first search iteration
  if (!state.isUserChatSaved) {
    try {
      await SaveChat({
        role: "user",
        message: state.userQuery,
        intent: state.intent,
        confidence: state.confidence,
      });
    } catch (e) {
      log.warn("Failed to save user chat in searchNode:", e.message);
    }
  }

  const stepNum = (state.searchCount || 0) + 1;
  log.info(`Executing web search step ${stepNum}/${MAX_RESEARCH_STEPS}`);
  let results = null;

  // Tier 1: SerpAPI
  try {
    log.info(`Querying SerpAPI for: "${state.augmentedQuery}"`);
    results = await searchTool.invoke({ input: state.augmentedQuery });
  } catch (serpErr) {
    log.warn(`SerpAPI search failed or quota exhausted: ${serpErr.message}`);
  }

  // Tier 2: Free DuckDuckGo Fallback
  if (!results) {
    log.info("Falling back to free DuckDuckGo search...");
    results = await searchDuckDuckGo(state.augmentedQuery);
  }

  // Tier 3: If both failed
  if (!results) {
    log.warn("All web search providers failed. Using existing state.");
    results = "No search results could be retrieved at this time.";
  }

  try {
    const doc = {
      query: state.augmentedQuery,
      results,
      time: new Date().toISOString(),
    };

    const existing = await redisClient.get(SEARCH_CACHE_KEY);
    let docs = existing ? JSON.parse(existing) : [];
    docs.push(doc);
    if (docs.length > 10) docs.shift();

    if (redisClient.isReady) {
      await redisClient.setEx(SEARCH_CACHE_KEY, REDIS_RESEARCH_TTL, JSON.stringify(docs));
    }
    log.info("Search results cached successfully");
  } catch (cacheErr) {
    log.warn("Failed to cache search results:", cacheErr.message);
  }

  return {
    ...state,
    searchResults: results,
    searchCount: stepNum,
    isUserChatSaved: true,
  };
}

// ---------------- DECISION NODE ----------------

function decisionNode(state) {
  if (state.done) return END;

  if ((state.searchCount || 0) >= MAX_RESEARCH_STEPS) {
    log.warn("Max search iterations reached. Ending research loop.");
    return END;
  }

  return "search";
}

// ---------------- GRAPH ----------------

const graph = new StateGraph({
  channels: {
    userQuery: "string",
    augmentedQuery: "string",
    searchResults: "json",
    finalAnswer: "string",
    searchCount: "number",
    done: "boolean",
    allowHTML: "boolean",
    intent: "string",
    confidence: "number",
    isUserChatSaved: "boolean",
    mustSearch: "boolean",
  },
});

graph.addNode("think", thinkNode);
graph.addNode("search", searchNode);

// Entry point: always start with a forced search on fresh queries
graph.setEntryPoint("search");

graph.addEdge("search", "think");

graph.addConditionalEdges("think", decisionNode, {
  search: "search",
  [END]: END,
});

export const researchAgent = graph.compile();