import chatApp from "./chat.app.js";

export default async function appHandler(text, intent){
    if(!intent || !intent.intent){
        console.error("Invalid intent data");
        return;
    }else if(intent.intent === "chat"){
        return await chatApp(text, intent);
    }
}