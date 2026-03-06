import chatApp from "./chat.app.js";
import financeAddApp from "./finance.add.app.js";
import financeQueryApp from "./finance.query.app.js";
import scheduleAddApp from "./schedule.add.app.js";
import scheduleQueryApp from "./schedule.query.app.js";

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