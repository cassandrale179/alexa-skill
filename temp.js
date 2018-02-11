exports.handler = (event, context) => {

    try{
        //Check new event session
        if (event.session.new){
            console.log("New Session");
        }

        switch(event.request.type){
            case "Launch Request":
                console.log(`Launch Request`);
                context.succeed(
                    generateResponse(
                        buildSpeechletResponse("Welcome to Alexa Skill, this is running on lambda function", true),
                        {}
                    )
                );
                break;

            case "Intent Request":
                console.log(`Intent Request`);
                break;

            case "Session End Request":
                console.log(`Session End Request`);
                break;


            default:
                context.fail(`Invalid request type: ${event.request.type}`);
        }
    }
    catch(error){
        context.fail(`Exception: ${error}`);
    }
};


//--------------------- HELPER FUNCTION -------------------
buildSpeechletResponse = (outputText, shouldEndSession) => {
    return {
        outputSpeech: {
            type: "PlainText",
            text: outputText
        },
        shouldEndSession: shouldEndSession
    };
};


//---------------------- GENERATE REPONSE ----------------------
generateResponse = (sessionAttributes, speechletReponse) => {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletReponse
    };
};
