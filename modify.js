const AWS = require('aws-sdk');
const proxy = require('proxy-agent');

//-------- SPECIFY PARAMETERS ON WINDOWS --------
if (process.platform == "win32"){
    AWS.config.update({
        httpOptions: { agent: proxy("http://proxy-server.bms.com:8080")}
    });
    var credentials = new AWS.SharedInFileCredentials({profile: 'mock-bms-test'});
}


//-------- SPECIFY PARAMETERS ON MAC -------
else{
    AWS.config.update({region: 'us-west-2'});
}


//-------- CREATING AWS RESOURCES ---------
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();


//-------- LIST OF PARAMETERS AND VARIABLES -----------
var bucketParams = {
    Bucket: 'bms-central-us-east-1-doat/doAtTrack',
    Key: 'callback.json',
};
var lambdaParams = {
    Code:{},
    Description: "This is the first lambda",
    FunctionName: "LambdaFunction1",
    Handler: "modify.js.lambda1handler",
    MemorySize: 128,
    Publish: true,
    Role: "arn:aws:iam::570374259950:role/service-role/doAtRole",
    Runtime: "nodejs8.10",
    VpcConfig: {}
};
var fakedata = {
	"triggerDate": "2018-02-06T21:54:32Z",
	"payload": "test sns message",
	"callbackType": "sns",
	"callbackEndpoint": "arn:aws:sns:us-east-1:315327487940:doAtSNSGuide_us-east-1",
	"requesterEmail": "minh.le@bms.com"
};


//--------- CREATING THE FIRST LAMBDA --------
lambda.createFunction(lambdaParams, function(err, data){
    console.log("Currently creating a Lambda function");
    if (err){
        console.log("Error", err, err.stack);
    }
    else{
        console.log(data);
    }
});


//--------- GET OBJECT TAGS - EXECUTION ID OF LAMBDA --------
function getObjectTagging(){
    s3.getObjectTagging(bucketParams, function(err, data){

        // If no object exist yet, create one
        if (err && err.code == 'NoSuchKey'){
            console.error("[Error at line 34: ] Unable to get object tags");
            getObject(bucketParams);
        }

        // Unknown error
        else if (err){
            console.error("[Error at line 37: ] Unknown error", err);
        }

        // Successful call
        else{

            //If there are already tags, sleep for 1000 ms
            var tag = data.TagSet.filter(obj => obj.Key == 'claim')[0];
            console.log("Tag value", tag.Value);
            if (tag.Value != 'lambdaexecutionid' && tag.Value != ''){
                console.log('Another lambda is writing to this file');
                setTimeout(getObjectTagging, 1000);
            }

            //If there are no tags, get object info ---
            else{
                console.log("Get object info");
                getObject(bucketParams);
            }
        }
    });
}

//----------- GET DETAILS OF AN S3 OBJECT --------------
function getObject(bucketParams){
   s3.getObject(bucketParams, function(err, data) {

       //--- Create object if none exist in bucket ---
       if (err){
           if (err.code == 'NoSuchKey'){
               console.log("Callback.json doesn't exist, creating a new file");
               original = JSON.stringify(fakedata);
               uploadFile(original.trim());
           }
           else
            console.error("[Error: ] Unable to get objects of bmscentral", err);
       }

       //--- Update content and upload to bucket ---
       else{
          console.log('Object data', data.Body);
          content = data.Body.toString('ascii');
          content += JSON.stringify(fakedata) + ",";
          uploadFile(content.trim());
       }
   });
}

//-------------- UPLOAD A JSON FILE TO S3 -----------------
function uploadFile(uploadContent){
    var base64data = new Buffer(JSON.stringify(uploadContent), 'binary');
    s3.putObject({
        Bucket: 'bms-central-us-east-1-doat/doAtTrack',
        Key: 'callback.json',
        Body: base64data,
        Tagging: "claim=lambdaexecutionid",
        ACL: 'public-read'
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

//--------- CALLING THE FUNCTION HERE -----------
// getObjectTagging();
