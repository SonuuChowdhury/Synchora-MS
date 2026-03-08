import { SerpAPI } from "@langchain/community/tools/serpapi";
import dotenv from "dotenv";

dotenv.config({quiet: true});

const token = process.env.SERP_API_KEY;
const searchTool = new SerpAPI(token);

export default searchTool;