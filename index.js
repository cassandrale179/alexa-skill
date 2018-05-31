const AWS = require('aws-sdk');
const proxy = require('proxy-agent');
const bucketname = 'cassandrale19-bms-central-us-east-1'; 
const bucketkey = 'doAtTrack/callback.json'; 


//-------- SPECIFY PARAMETERS ON WINDOWS --------
AWS.config.update({region: 'us-west-2'});


//-------- CREATING AWS RESOURCES ---------
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();




//--------- EXPORT HANDLER TO WRITE TO S3 BUCKET ---------
exports.handler = function(event, context, callback) {
    console.log("This is the event", event);
    console.log("This is the context", context);
    console.log("This is the s3 bucket", s3); 
    
    //----- LIST OF VARIABLES TO BE USED ------- 
    var bucketParams = {
        Bucket: bucketname,
        Key: bucketkey,
    };
    var fakedata = {
    	"triggerDate": "2018-02-06T21:54:32Z",
    	"payload": "test sns message",
    	"callbackType": "sns",
    	"callbackEndpoint": "arn:aws:sns:us-east-1:315327487940:doAtSNSGuide_us-east-1",
    	"requesterEmail": "minh.le@bms.com"
    };


    //--------- GET OBJECT TAGS AND EXECUTION ID OF LAMBDA --------
    function getObjectTagging(){
        s3.getObjectTagging(bucketParams, function(err, data){

            // If no object exist yet, create one
            if (err){
                if (err.code == 'NoSuchKey'){
                   uploadFile(fakedata);  
                }
                    
                else{
                  console.error("[Error at line 37: ] Unknown error", err);
                }
            }
            
            //If object already exist, check for the tags 
            else{
                var tag = data.TagSet.filter(obj => obj.Key == 'claim')[0]; 
                if (tag){

                    //If another Lambda is writing to it, sleep for 1000 ms
                    if (tag.Value != context.invokedFunctionArn && tag.Value != ''){
                        console.log('Another lambda is writing to this file.');
                        setTimeout(getObjectTagging, 1000);
                    }

                    //If the tags are your own tags, then writing to it
                    else{
                        console.log("Can write to bucket");
                        appendContent(); 
                    }
                }
            }
        });
    }
    
    
    //-------- APPEND NEW CONTENT TO THE CALLBACK.JSON ------ 
    function appendContent(){
        s3.getObject(bucketParams, function(err, data) {

           //--- Create object if none exist in bucket ---
           if (err){
               if (err.code == 'NoSuchKey'){
                   console.log("Callback.json doesn't exist, creating a new file");
                   var original = JSON.stringify(fakedata);
                   uploadFile(original.trim());
               }
               else{
                   console.error("[Error: ] Unable to get objects at line 87", err);
               }
           }
    
           //--- Update content and upload to bucket ---
           else{
              console.log('Object data', data.Body);
              var content = data.Body.toString('ascii');
              content += JSON.stringify(fakedata) + ",";
              uploadFile(content.trim());
           }
        });
    }

    //-------------- UPLOAD A JSON FILE TO S3 -----------------
    function uploadFile(uploadContent){
        var tagobject = "claim=" + context.invokedFunctionArn; 
        console.log("Tag object", tagobject); 
        var base64data = new Buffer(JSON.stringify(uploadContent), 'binary');
        s3.putObject({
            Bucket: bucketname,
            Key: bucketkey,
            Body: base64data,
            Tagging: tagobject
        }, (err, data) => {
            if (err){
                console.error("[Error at 101: ] Unable to upload file", err);
            }
            else{
                console.log("Successfully upload package", data);
            }
            clearTag();
        });
    }

    //----------- CLEAR TAGS AFTER UPLOADING ------
    function clearTag(){
        var tagobj =  {
          TagSet: [{
             Key: "claim",
             Value: ""
            }]
        };
        bucketParams.Tagging = tagobj;
        s3.putObjectTagging(bucketParams, function(err, data){
            if (err){
                console.log('[Error: ] Unable to tag objects');
            }
            else{
                console.log('[Success: ] Clear bucket tags');
            }
        });
    }

    getObjectTagging();
};
