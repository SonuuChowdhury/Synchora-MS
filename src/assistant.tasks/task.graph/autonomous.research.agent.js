import dotenv from "dotenv";
import { StateGraph, END } from  '@langchain/langgraph'
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import searchTool from "../../config/scraper.config.js";
import researchPrompt from "../../prompts/research.prompt.js";
import SaveChat from "../../db.tasks/chat.save.app.js";
import chalk from "chalk";

dotenv.config({ quiet: true });
const MAX_RETRIES = 2;

// -------- SEARCH NODE --------
async function searchNode(state) {
  const queryToUse = state.augmentedQuery || state.userQuery;
  try{
    console.log(chalk.cyan("🧠 Research Agent: ") +"Searching the web...");
    const results = await searchTool.invoke({input: queryToUse});
    return {...state, searchResults: results};
  }catch(error){
    console.error(chalk.magenta('\n📢 Serp API Search failed:') + error.message+ "\n" + chalk.magenta('📢 Detailed error: ')+ error);
  }
}

// -------- SUMMARIZE NODE --------
async function summarizeNode(state) {
  try{
    const prompt = await researchPrompt.format({
    userQuery: state.userQuery,
    searchQuery: state.augmentedQuery || state.userQuery,
    searchResults: JSON.stringify(state.searchResults)
  });
  console.log(chalk.cyan("🧠 Research Agent: ") +"Summarizing search results...");
  const res = await GeminiMainModel.invoke(prompt);
  const cleaned = res.content.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // ✅ FINAL ANSWER
  if (parsed.final) {
    const answer = parsed.answer;
    // save chat using your function
    await SaveChat({
      role: "synchora",
      message: answer,
      intent: "research_query",
      confidence: 0.95
    });
    return {
      ...state,
      finalAnswer: answer,
      done: true
    };
  }

  // 🔁 NEED RETRY
  return {
    ...state,
    augmentedQuery: parsed.better_search_query,
    retryCount: (state.retryCount || 0) + 1,
    done: false
  };
  }catch(error){
    console.error(chalk.magenta('\n📢 Research summarization failed:') + error.message+ "\n" + chalk.magenta('📢 Detailed error: ')+ error);
  }
}


// -------- DECISION NODE --------
function decisionNode(state) {
  if (state.done) {
    console.log(chalk.cyan("🧠 Research Agent: ") +"prepairing final output...");
    return END};
  if (state.retryCount >= MAX_RETRIES) {
    console.log(chalk.cyan("🧠 Research Agent: ") +"reached threshold evaluation limit, returning final answer...");
    return END;
  }
  console.log(chalk.cyan("🧠 Research Agent: ") +"Retrying search with augmentated query...");
  return "search";
}

// -------- GRAPH --------
const graph = new StateGraph({
  channels: {
    userQuery: "string",
    augmentedQuery: "string",
    searchResults: "json",
    finalAnswer: "string",
    retryCount: "number",
    done: "boolean"
  }
});

graph.addNode("search", searchNode);
graph.addNode("summarize", summarizeNode);
graph.setEntryPoint("search");
graph.addEdge("search", "summarize");
graph.addConditionalEdges("summarize",decisionNode,
  {
    search: "search",
    [END]: END
  }
);

export const researchAgent = graph.compile();