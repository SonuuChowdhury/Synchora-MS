import dotenv from "dotenv";
import { StateGraph, END } from "@langchain/langgraph";
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import searchTool from "../../config/scraper.config.js";
import researchThink from "../../prompts/research.think.prompt.js";
import redisClient from "../../config/redis.config.js";
import GetChatHistory from "../../db.tasks/chat.get.app.js";
import SaveChat from "../../db.tasks/chat.save.app.js";
import chalk from "chalk";

dotenv.config({ quiet: true });

const SEARCH_CACHE_KEY = "synchora:research_cache";

/*
Important research safety limits
*/
const MAX_SEARCH_STEPS = 3;

// ---------------- THINK NODE ----------------

async function thinkNode(state) {
  console.log(chalk.cyan("🧠 Research Agent: ") + "Analyzing history...");

  try {

    // Save user chat once
    if (!state.isUserChatSaved) {
      await SaveChat({
        role: "user",
        message: state.userQuery,
        intent: state.intent,
        confidence: state.confidence,
      });

      state.isUserChatSaved = true;
    }

    const history = await redisClient.get(SEARCH_CACHE_KEY);
    const recentChats = await GetChatHistory();

    let formattedHistory = "No search history available.";

    if (history) {
      try {
        const parsed = JSON.parse(history);
        formattedHistory = parsed
          .map((d) => {
            return `Query: ${d.query}\nResults: ${JSON.stringify(d.results).slice(0, 1200)}\nTime: ${d.time}`;
          })
          .join("\n\n");
      } catch {
        formattedHistory = history;
      }
    }

    let formattedChats = "No recent chats available.";

    if (recentChats && recentChats.length) {
      formattedChats = recentChats
        .slice(-10)
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
      console.error(chalk.red("JSON Parse Failed:"), cleaned);

      return {
        ...state,
        done: true,
        finalAnswer: "I couldn't process the research results.",
      };
    }

    if (parsed.found) {
      console.log(chalk.green("🧠 Research Agent: Answer resolved."));

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

    /*
    Prevent infinite research loops
    */
    if ((state.searchCount || 0) >= MAX_SEARCH_STEPS) {
      console.log(
        chalk.yellow("🧠 Research Agent: Search limit reached, forcing answer.")
      );

      const fallbackAnswer =
        "I gathered some information but could not perform further searches. Here is the best available answer based on current results.";

      return {
        ...state,
        finalAnswer: fallbackAnswer,
        done: true,
      };
    }

    console.log(chalk.yellow("🧠 Research Agent: Need web search."));

    return {
      ...state,
      augmentedQuery: parsed.preSearchAugmentedQuery,
      searchCount: (state.searchCount || 0) + 1,
      done: false,
    };
  } catch (error) {
    console.error(chalk.magenta("📢 Research thinking failed: "), error);

    return {
      ...state,
      done: true,
      finalAnswer: "Research module encountered an error.",
    };
  }
}

// ---------------- SEARCH NODE ----------------

async function searchNode(state) {
  console.log(chalk.cyan("🌐 Research Agent: Searching web..."));

  try {
    console.log(chalk.blue("🔍 Searching for: ") + state.augmentedQuery);
    const results = await searchTool.invoke({
      input: state.augmentedQuery,
    });

    const doc = {
      query: state.augmentedQuery,
      results,
      time: new Date().toISOString(),
    };

    const existing = await redisClient.get(SEARCH_CACHE_KEY);

    let docs = [];

    if (existing) {
      docs = JSON.parse(existing);
    }

    docs.push(doc);

    // keep last 10 searches
    if (docs.length > 10) docs.shift();

    await redisClient.setEx(SEARCH_CACHE_KEY, 600, JSON.stringify(docs));

    console.log(chalk.green("🌐 Research Agent: Search cached."));

    return {
      ...state,
      searchResults: results,
    };
  } catch (error) {
    console.error(chalk.magenta("📢 SERP Search failed: "), error);

    return state;
  }
}

// ---------------- DECISION NODE ----------------

function decisionNode(state) {
  if (state.done) return END;

  if ((state.searchCount || 0) >= MAX_SEARCH_STEPS) {
    console.log(chalk.red("🧠 Research Agent: Max search limit reached."));
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
  },
});

graph.addNode("think", thinkNode);
graph.addNode("search", searchNode);

graph.setEntryPoint("think");

graph.addConditionalEdges("think", decisionNode, {
  search: "search",
  [END]: END,
});

graph.addEdge("search", "think");

export const researchAgent = graph.compile();