import chatApp from "./tasks.chain/chat.app.js";
import financeAddApp from "./tasks.chain/finance.add.app.js";
import financeQueryApp from "./tasks.chain/finance.query.app.js";
import scheduleAddApp from "./tasks.chain/schedule.add.app.js";
import scheduleQueryApp from "./tasks.chain/schedule.query.app.js";
import {researchAgent} from "./task.graph/autonomous.research.agent.js";

export default async function appHandler(text, intent){
    if(!intent || !intent.intent){
        console.error("Invalid intent data");
        return;
    }else if(intent.intent === "chat"){
        return await chatApp(text, intent);
    }else if(intent.intent === "finance_add"){
        return await financeAddApp(text, intent);
    }else if(intent.intent === "finance_query"){
        return await financeQueryApp(text, intent);
    }else if(intent.intent === "schedule_add"){
        return await scheduleAddApp(text, intent);
    }else if(intent.intent === "schedule_query"){
        return await scheduleQueryApp(text, intent);
    }else if(intent.intent === "research_query"){
        const researchQueryResponse = await researchAgent.invoke({
            userQuery: text,
            searchQuery: text,
            searchResults: []
        });
        return researchQueryResponse.finalAnswer || "I'm sorry, I couldn't find a clear answer to your question.";
    }else if(intent.intent === "error"){
        return "I didn't catch that. Could you please say it again?";
    }else if(intent.intent === "no_text"){
        return "I didn't catch that. Could you please say it again?";
    }else if(intent.intent === "no_support"){
        return "I'm sorry, but I can't assist with that request at the moment.";
    }else{
        return "I'm sorry, but I can't assist with that request at the moment.";
    }
}