var AWS = require('aws-sdk');
exports.myHandler = function (event, context, callback) {
	console.log("Hello server! event is ", event);
	console.log("Hello server! context is ", context);

	var sts = new AWS.STS();
    var s3 = new AWS.S3();

	function SendMessageError(errorMessage) {
		this.name = "SendMessageError";
		this.message = errorMessage;
	}

	SendMessageError.prototype = new Error();

	var mypromise = new Promise(function (resolve, reject) {
			var params = {
				DurationSeconds: 900,
				RoleArn: event.accountRoleArn,
				RoleSessionName: "doAt-" + context.awsRequestId
			};
			sts.assumeRole(params, function (err, data) {
				if (err) {
					console.log(err, err.stack);
					reject("Unable to assume role " + params.RoleArn + ". Make sure this role is valid & created before calling this CR." + (err && err.message ? err.message : ""));
					const error = new SendMessageError(err.message);
					callback(error);
					return;
				} else {
					console.log("Data: ", data);
					var tempCred = {
						accessKeyId: data.Credentials.AccessKeyId,
						secretAccessKey: data.Credentials.SecretAccessKey,
						sessionToken: data.Credentials.SessionToken,
						region: "us-east-1"
					};
					resolve(tempCred);
					return;
				}
			});
		});

    // Get temporary credentials then use that to send message to SNS, SQS, or Lambda
	mypromise.then(function (tempCred) {
		console.log("TempCred: ", tempCred);
		var sqs = new AWS.SQS(tempCred);
		var sns = new AWS.SNS(tempCred);
		var lambda = new AWS.Lambda(tempCred);

        // Successfully get event with sender ARN
		if (event !== undefined && event !== "" && event.senderArn !== undefined && event.senderArn !== "") {
			var params = {};
			var message = {
				"triggerDate": event.triggerDate,
				"payload": event.payload,
				"callbackType": event.callbackType,
				"callbackEndpoint": event.callbackEndpoint,
				"requesterEmail": event.requesterEmail,
				"originalRequestTime": event.originalRequestTime,
				"messageId": event.messageId,
				"senderArn": event.senderArn
			};

            // Parameters of a S3 bucket
            var bucketname = 'doatbucket-lem1';
            var bucketkey = 'doAtTrack/' + message.callbackEndpoint + ".json";
        	var bucketParams = {
                Bucket: bucketname,
                Key: bucketkey,
            };

            // Write the unexecuted call into a JSON file
            getObjectTagging(bucketParams, message);


            // If message is of type SNS
			if (((message.callbackType).toLowerCase()) == "sns") {
				params = {
					TargetArn: message.callbackEndpoint,
					Message: JSON.stringify(message),
					Subject: "DoAt Message from " + message.requesterEmail
				};
				sns.publish(params, function (err, data1) {
					if (err) {
						console.log("Error: ", err);
						const error = new SendMessageError(err.message);
						callback(error);
					} else {
						console.log(data1);
						console.log('Message sent to topic!');
						message = null;
					}
				});
			}

            // If message is of type SQS
            else if (((message.callbackType).toLowerCase()) == "sqs") {
				params = {
					MessageBody: JSON.stringify(message),
					QueueUrl: message.callbackEndpoint
				};

				sqs.sendMessage(params, function (err, data2) {
					if (err) {
						console.log("Error: ", err);
						const error = new SendMessageError(err.message);
						callback(error);
					} else {
						console.log(data2);
						console.log("Message sent to queue!");
						message = null;
					}
				});
			}

            // If message is of type lambda
            else if (((message.callbackType).toLowerCase()) == "lambda") {
				params = {
					FunctionName: message.callbackEndpoint,
					ClientContext: 'doAt',
					InvocationType: "Event",
					LogType: "None",
					Payload: JSON.stringify(message)
				};
				lambda.invoke(params, function (err, data3) {
					if (err) {
						console.log("Error: ", err);
						const error = new SendMessageError(err.message);
						callback(error);
					} else {
						console.log(data3);
						console.log("Message sent to lambda!");
						message = null;
					}
				});
			}

            return [message, bucketParams];
		}


        // There is error when trying to send message to SQS, SNS or Lambda
        else {
			console.log("Error: One or more inputs is missing or empty");
			const error = new SendMessageError("Error: One or more inputs is missing or empty");
			callback(error);
			return;
		}
	})


    // Delete successfully executed message calls
	.then(function(arr){
        var message = arr[0];
		var bucketParams = arr[1];
        console.log("This message id should be gone", message.messageId);
		if (message && bucketParams){
			clearEndpoint(bucketParams, message);
		}
    });

    /**
		Def: this function get tags of an object, and create a new file if it doesn't exist
        @param {AWS object} s3: this is the s3 bucket for Data Account Access (doatbucket-lem1)
        @param {string} bucketParams: parameter for bucket with the endpoint as name of json
        @param {object} message: contain endpoint, triggerdate, messageID, senderARN, time, payload
	*/
    function getObjectTagging(bucketParams, message){
        s3.getObjectTagging(bucketParams, function(err, data){

            // If no object exist yet, create one
            if (err){
                console.error("[Error at line 37: ] Unknown error", err);
                uploadFile(bucketParams, message);
            }

            // If object already exist, check for the tags
            else{
                console.log("DATA!!!!!", data);
                var tag = data.TagSet.filter(obj => obj.Key == 'claim')[0];
                if (tag){

                    // If another Lambda is writing to it, sleep for 1000 ms
                    if (tag.Value != context.invokedFunctionArn && tag.Value != ''){
                        console.log('Another lambda is writing to this file.');
                        setTimeout(getObjectTagging.bind(bucketParams, message), 1000);
                    }

                    // If the tags are your own tags, then you can write to it
                    else{
                        console.log("Can write to bucket");
                        appendContent(bucketParams, message);
                    }
                }
            }
        });
    }


    /**
        Def: this function append unexecuted call to the JSON body
        @param {string} bucketParams: parameter for bucket with the endpoint as name of json
        @param {object} message: contain endpoint, triggerdate, messageID, senderARN, time, payload
    */
    function appendContent(bucketParams, message){
        s3.getObject(bucketParams, function(err, data) {

           // Create endpoint.json if none exist in bucket
           if (err){
               console.error("Unable to get object", err);
               var original = JSON.stringify(message);
               uploadFile(bucketParams, original.trim());
           }

           // Update object if endpoint.json already exist
           else{
              var content = data.Body.toString('ascii');
              content += JSON.stringify(message) + ",";
              console.log("Content before upload", content.trim());
              uploadFile(bucketParams, content.trim());
           }
        });
    }


    /**
		@definition: this funciton writes a new .json file and upload it
        @param {string} bucketParams: parameter for bucket with the endpoint as name of json
        @param {object} message: contain endpoint, triggerdate, messageID, senderARN, time, payload
	*/
    function uploadFile(bucketParams, message){
        var tagobject = "claim=" + context.invokedFunctionArn;
        var base64data = new Buffer(JSON.stringify(message), 'binary');
		console.log("Tag object", tagobject);
        s3.putObject({
            Bucket: bucketParams.Bucket,
            Key: bucketParams.Key,
            Body: base64data,
            Tagging: tagobject
        }, (err, data) => {
            if (err){
                console.error("[Error at 101: ] Unable to upload file", err);
            }
            else console.log("Successfully upload package", data);
            clearTag(bucketParams);
        });
    }


    /**
		Def: clear tags of a bucket after Lambda is done writing
	*/
    function clearTag(bucketParams){
        var tagobj =  {
          TagSet: [{
             Key: "claim",
             Value: ""
            }]
        };
        bucketParams.Tagging = tagobj;
        s3.putObjectTagging(bucketParams, function(err, data){
            if (err){
                console.log('[Error: ] Unable to tag objects', err);
            }
            else{
                console.log('[Success: ] Clear bucket tags');
            }
        });
    }


    /**
		Def: delete content of an end point after it is done executing
		@param {string} message: delete successfully executed message
	*/

    var attempt = 0;
    function clearEndpoint(deleteParams, message){

		// Read only the object at a given endpoint
        s3.getObject(deleteParams, (err, data) => {


            //If unable to get object, retry another time if object hasn't been created
            if (err){
                console.error("Unable to get endpoint json. Calling it again", err);
                if (attempt < 2) {
                    clearEndpoint(deleteParams, message);
                    attempt += 1;
                }
            }

            // Log out object data successfully
            else{
                var content = data.Body.toString('ascii');
                var res = parseString(content);
				console.log("Content from endpoint ", content);

				// If JSON is empty and delete JSON
				var isEmpty = content.replace(/"/g, "'");
				if (isEmpty == '' || isEmpty == undefined){
					console.log("Deleting object");
					s3.deleteObject(deleteParams, (err, data) => {
						if (err) console.log(err, err.stack);
						else console.log(data);
					});
				}

				// If JSON is not empty, delete unexecuted calls
                else{
                    var new_res = res.filter(call => call.messageId != message.messageId);
                    console.log("NEW RESULT", new_res);
                    var unexecutedStr = new_res.join('');
					console.log("unexecuted string!!!!!!", unexecutedStr);
					uploadFile(deleteParams, unexecutedStr);
				}
            }
        });
    }

	/**
		@param {string} hello: the ascii string that will become an array of objects
		@return {array} results: an array of calls both unexecuted and executed
	*/
    function parseString(hello){
	      hello = hello.replace(/\\/g, '');
	      hello = hello.substring(2, hello.length-1);
	      var res = hello.split("}");
	      var results = [];
	      res.forEach(obj => {
	        obj = obj + "}";
	        obj = obj.substring(obj.indexOf("{"), obj.indexOf("}")+1);

	        if (obj.charAt(0) == "{"){
	          var json_obj = JSON.parse(obj);
	          results.push(json_obj);
	        }
		});
	      return results;
    }
};
