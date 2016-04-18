// Initialization
var express = require('express');
var multer = require('multer');
var bodyParser = require('body-parser'); // Required if we need to use HTTP query or post parameters
var unirest = require('unirest');
var formidable = require('formidable');
var util = require('util');
var fs = require('fs-extra');
var qt = require('quickthumb');

var server = "http://peaceful-cove-69430.herokuapp.com/";

var app = express();

var sky_api_key = "94268d2c6049471283eb781d34391c16";
var sky_api_secret = "2cf82e0f29c44dd0b4649a9d8f4469f6";
var service_root = 'http://api.skybiometry.com/fc/';

app.use(bodyParser.json());
app.use(qt.static(__dirname + '/'));
app.use(multer({dest:'./images/'}).any());
app.use(bodyParser.urlencoded({ extended: true })); // Required if we need to use HTTP query or post parameters
app.use(express.static(__dirname + '/public')); //serve static content
app.use(express.static(__dirname + '/images'));

var mongoUri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://heroku_9j5jdjrb:b03itk1jq0sfjs4frffj73f57o@ds011311.mlab.com:11311/heroku_9j5jdjrb';
var MongoClient = require('mongodb').MongoClient, format = require('util').format;
var db = MongoClient.connect(mongoUri, function(error, databaseConnection) {
  db = databaseConnection;
});

// upload photo with multer
// should delete stored file after processing to block attacks
// see http://stackoverflow.com/questions/23691194/node-express-file-upload
// faces/detect method for skybiometry
// for calibrating one's own picture
// TODO: merge with /sendName
app.post('/uploadPhoto', function(request, response){ 
	var imgPath = request.files[0]["path"];
	var link = service_root + "faces/detect?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&urls=" + server + imgPath;
	
	// for local server:
	// var link = service_root + "faces/detect?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&urls=http://www.tvchoicemagazine.co.uk/sites/default/files/imagecache/interview_image/intex/michael_emerson.png";
	console.log(link);
	unirest.get(link,
				function(faceDetectResponse) {
					if (faceDetectResponse.error) {
						return response.status(500).send({message: faceDetectResponse.error});
					}

					var body = faceDetectResponse.body;
					var tags = "";

					// user should send photo with only one face
					// so that face training isn't complicated
					for (var i in body.photos) {
						if (body.photos[i].tags) { 
							if (body.photos[i].tags.length > 1) {
								response.send(400, {message: "Send photo with only one face for calibration"});
							}
							else if (body.photos[i].tags.length === 1) {
								tags += body.photos[i].tags[0].tid + ',';
							}
						}
					}

					// if no faces, error
					if (tags.length === 0) {
						response.send(400, {message: "no faces detected"});
					}

					console.log('tag ids are: ' + tags);
					console.log('name is ' + request.body.userid);
					var uid = request.body.userid;

					// TODO: check db if uid already used. if so, add number to end of uid
					// db.collection('players').find({"uid":uid}).toArray(function(err, arr){
					// 	if (arr.length != 0) { // someone already has that uid
					// 		uid += arr.length; // append number to end of uid
					// 	}
					// });

					// save tags
					unirest.get(service_root + "tags/save?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&uid=" + uid + "@snapspace" + "&tids=" + tags,
								function(tagSaveResponse){
									if (tagSaveResponse.error) {
										return response.send(500, tagSaveResponse.error);										
									}

									// start face training
									unirest.get(service_root + "faces/train?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&uids=" + request.body.userid + "@snapspace",
												function(faceTrainResponse) {
													if (faceTrainResponse.error) {
														return response.send(500, faceTrainResponse.error);
													}

													console.log('successfully trained a face');
												});
									
								});


					response.send('training...');
					// response.send(body);
					// response.redirect('back');
				});
});

// to recognize a face
// TODO: merge with assassinate button
app.post('/assassinate', function(request, response){ 
	unirest.get(service_root + "faces/recognize?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&uids=" + "emerson" + "&urls=http://mtv.com/news/wp-content/uploads/geek/2012/09/michael_emerson_lost.jpg" + "&namespace=snapspace",
				function(faceRecogResponse) {

					if(faceRecogResponse.error) {
						response.send(500, faceRecogResponse.error);
					}
					// API can give success response, but not have detected any face
					else if (!faceRecogResponse.body.photos[0].tags || !faceRecogResponse.body.photos[0].tags[0]) {
						response.send(400, {message: "Sorry no faces detected"})
					}

					var tag = "";
					var uid = [];


					for (var i in faceRecogResponse.body.photos[0].tags) {	
						if (faceRecogResponse.body.photos[0].tags[i].uids) { // api has a guess who it is
							for (var j in faceRecogResponse.body.photos[0].tags[i].uids) {
								uid.unshift(faceRecogResponse.body.photos[0].tags[i].uids[j].uid);
							}
						}
					}

					console.log(uid);
					response.send(uid);
				});

});

app.get('/', function(request, response) {
	response.sendFile(__dirname + 'public/index.html');
});

// receive login and gameID from client, returns json 
// json includes list of other players' logins
// if login not present in db, return empty json
// TODO: attach uid from skybio to ones doc in mongodb
app.post('/sendName', function(request, response) {
	response.header("Access-Control-Allow-Origin", "*");
  	response.header("Access-Control-Allow-Headers", "X-Requested-With");

  	var login = request.body.login;
  	var gameID = Number(request.body.gameID);

  	var toInsert = {
  		"login":login,
  		"target":"",
  		"gameID":gameID
  	}
 
  	// check is login is present in db
  	// if it is, return json

  	if (login && gameID) {
  		db.collection('players').insert(toInsert, function(err, player) {
  			if(err) response.send('failure to insert');
  			else {
  				var player_logins = [];
  				db.collection('players').find({"gameID":gameID}).toArray(function(err, players){

  					for (var i = 0; i < players.length; i++) {
  						player_logins.push(players[i].login);
  					}
  					response.send(player_logins);
  				});
  			}
  		})
  	}
  	else {
  		response.send({"error":"Something wrong with your data"})
  	}

});


// takes login and gameID from client
// eliminates client's target from db 
// and assigns new target to user
app.post('/nextTarget', function(request, response) {
	response.header("Access-Control-Allow-Origin", "*");
  	response.header("Access-Control-Allow-Headers", "X-Requested-With");

  	var login = request.body.login;
  	var gameID = Number(request.body.gameID);
  	var targetName;
  	var newTarget;
  	var cursor = db.collection('players');

  	cursor.find({"login":login, "gameID":gameID}).toArray(function(err, arr){
  		// target = arr[0]["target"];
  		targetName = arr[0]["target"];

  		
  		cursor.find({"login":targetName,"gameID":gameID}).toArray(function(err, arr2) {
  			newTarget = arr2[0]["target"];
  			// if (newTarget == null) {
	  		// 	// if only one player left in gameID, must be winner
	  		// 	cursor.find({"gameID":gameID}).toArray(function(err, arr3) {
	  		// 		if (arr2.length === 1) {
	  		// 			response.send('You won!');
	  		// 		}
	  		// 	});
  			// }
  			// else {
		  		cursor.remove({"login":targetName,"gameID":gameID});
		  		cursor.update(
		  			{"login":login, "gameID":gameID},
		  			{
		  				$set: {
		  					"target": newTarget
		  				}
		  			}
		  		)
		  		// if only one player left in gameID, must be winner
	  			cursor.find({"gameID":gameID}).toArray(function(err, arr3) {
	  				if (arr3.length === 1) {
	  					cursor.remove({});
	  					response.send('You won!');
	  				}
	  				else {
		  				response.send(newTarget);
	  				}
	  			});
		  	// }
  		});
  		
  	});
});


function assign(players_arr, gameID) {
	console.log(players_arr);
	var cursor = db.collection('players');

	shuffle(players_arr);

	var newTarget;

	cursor.find({gameID:gameID}).forEach(function(doc) {
		if (doc.login != players_arr[players_arr.length - 1].login) {
			newTarget = players_arr.pop().login;
			
			db.collection('players').update(
					{"_id":doc._id},
					{
						$set: {
							"target":newTarget
						}
					}
			)
			
		} 
		else if (doc.login != players_arr[0].login) {
			newTarget = players_arr.shift().login;
			
			db.collection('players').update(
				{"_id":doc._id},
				{
					$set: {
						"target":newTarget
					}
				}
			)
			
		}
		else {
			// if player doesnt have a target, assign it to target "failnonefail02857"
			// this will fail badly if a user has login "failnonefail02857"
			db.collection('players').update(
				{"_id":doc._id},
				{
					$set: {
						"target":"failnonefail02857"
					}
				}
			)
		}
	});

	// account for player not getting a target
	cursor.find({"gameID":gameID, "target":"failnonefail02857"}).toArray(function(err, arr){
		if (arr.length > 0) { // there exists players with no target
			console.log("arr.length == " + arr.length);
			assign(players_arr, gameID);
		}
	});

	return;
}

// takes gameID from client
// assigns targets to all players in db with given gameID
app.post('/assignTargets', function(request, response) {
	response.header("Access-Control-Allow-Origin", "*");
  	response.header("Access-Control-Allow-Headers", "X-Requested-With");

	var gameID = Number(request.body.gameID);
	var cursor = db.collection('players');
	cursor.find({gameID:gameID}).toArray(function(err, players_arr) {
		if (err) {
			response.send('failure in finding "players"');
		}
		else {

			assign(players_arr, gameID);

			response.send();
		}
	});
});

// takes login and gameID from client
// returns target as string
app.post('/getTarget', function(request, response) {
	response.header("Access-Control-Allow-Origin", "*");
  	response.header("Access-Control-Allow-Headers", "X-Requested-With");

	var login = request.body.login;
	var gameID = Number(request.body.gameID);

	if(login && gameID) {
		db.collection('players').find({"login":login, "gameID":gameID}).toArray(function(err, arr){
			if(err) response.send("couldn't find target");
			else {
				// assuming only one document found
				response.send(arr[0].target);
			}
		});
	}
	else {
		response.send("Name or Game ID invalid");
	}
});

function shuffle(a) {
    var j, x, i;
    for (i = a.length; i; i -= 1) {
        j = Math.floor(Math.random() * i);
        x = a[i - 1];
        a[i - 1] = a[j];
        a[j] = x;
    }
}

app.listen(process.env.PORT || 3000);