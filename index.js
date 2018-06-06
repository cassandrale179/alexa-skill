var AWS = require('aws-sdk');

exports.myHandler = function (event, context, callback) {
	console.log("Hello server! event is ", event);
	console.log("Hello server! context is ", context);


	// Set bucket name and bucket key of S3 here
	var s3 = new AWS.S3();
	var bucketname = 'doatbucket-lem1';
	var bucketkey = 'doAtTrack/endpoint1.json';

	// Create bucket params over here
	var bucketParams = {
        Bucket: bucketname,
        Key: bucketkey,
    };

	// Data to be written to the bucket
    var fakedata = {
        message: "hello world",
    	callbackEndpoint: "endpoint1",
    	requesterEmail: "minh.le@bms.com",
		executed: "true"
    };


	/**
		@defintion: this function get tags of an object
	*/
    function getObjectTagging(){
        s3.getObjectTagging(bucketParams, function(err, data){

            // If no object exist yet, create one
            if (err){
                if (err.code == 'NoSuchKey'){
                   uploadFile(fakedata);
                }

				// If error is not NoSuchKey, that probably means access denied
                else{
                  console.error("[Error at line 37: ] Unknown error", err);
                  uploadFile(fakedata);
                }
            }

            // If object already exist, check for the tags
            else{
                var tag = data.TagSet.filter(obj => obj.Key == 'claim')[0];
                if (tag){

                    // If another Lambda is writing to it, sleep for 1000 ms
                    if (tag.Value != context.invokedFunctionArn && tag.Value != ''){
                        console.log('Another lambda is writing to this file.');
                        setTimeout(getObjectTagging, 1000);
                    }

                    // If the tags are your own tags, then you can write to it
                    else{
                        console.log("Can write to bucket");
                        appendContent();
                    }
                }
            }
        });
    }


	/**
		@param {string} uploadContent: this string is written to the .json file
	*/
    function appendContent(){
        s3.getObject(bucketParams, function(err, data) {

           // Create object if none exist in bucket ---
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

           //  Update content and upload to bucket
           else{
              console.log('Object data', data.Body.toString('ascii'));
              var content = data.Body.toString('ascii');
              content += JSON.stringify(fakedata) + ",";
			  console.log("Content before upload", content.trim());
              uploadFile(content.trim());
           }
        });
    }

	/**
		@definition: this funciton writes a new .json file
		@param {string} uploadContent: this string is written to the .json file
	*/
    function uploadFile(uploadContent){
        var tagobject = "claim=" + context.invokedFunctionArn;
        var base64data = new Buffer(JSON.stringify(uploadContent), 'binary');
		console.log("Tag object", tagobject);
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

	/**
		Def: clear tags of a bucket after Lambda is done writing
	*/
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
                console.log('[Error: ] Unable to tag objects', err);
            }
            else{
                console.log('[Success: ] Clear bucket tags');
            }
        });
    }


    /**
		Def: delete content of an end point after it is done executing
		@param {string} endpoint_to_delete: delete content with this endpoint
	*/
    function clearEndpoint(endpoint_to_delete){
        var deleteParams = {
            Bucket: bucketname,
            Key: "doAtTrack/" + endpoint_to_delete + ".json"
        };

		// Read only the object at a given endpoint
        s3.getObject(deleteParams, (err, data) => {
            if (err)
                console.error("Unable to get endpoint json", err);
            else{
                console.log('Object data', data.Body);
                var content = data.Body.toString('ascii');
                var res = parseString(content);

				// If JSON is empty and delete JSON
				if (content == ''){
					s3.deleteObject(deleteParams, (err, data) => {
						if (err) console.log(err, err.stack);
						else console.log(data);
					});
				}

				// If JSON is not empty, delete unexecuted calls
                else{
					var unexecutedStr = "";
					res.forEach(call => {
						if (call.executed != 'true'){
							var callstr = JSON.stringify(call);
							unexecutedStr += callstr;
						}
					});
					uploadFile(unexecutedStr);
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


    getObjectTagging();
    clearEndpoint("endpoint1");

};
