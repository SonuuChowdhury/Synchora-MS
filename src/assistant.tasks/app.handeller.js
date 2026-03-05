import chatApp from "./chat.app.js";

export default async function appHandler(text, intent){
    if(!intent || !intent.intent){
        console.error("Invalid intent data");
        return;
    }else if(intent.intent === "chat"){
        return await chatApp(text, intent);
    }else if(intent.intent === "no_text"){
        return "I didn't catch that. Could you please say it again?";
    }else if(intent.intent === "no_support"){
        return "I'm sorry, but I can't assist with that request at the moment.";
    }
}