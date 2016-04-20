// Initialization
var express = require('express');
var multer = require('multer');
var bodyParser = require('body-parser'); // Required if we need to use HTTP query or post parameters
var unirest = require('unirest');
var formidable = require('formidable');
var util = require('util');
var fs = require('fs-extra');
var qt = require('quickthumb');
var expressSession = require('express-session');

// var server = "http://peaceful-cove-69430.herokuapp.com/";
var server = "http://localhost:3000/"

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
app.use( expressSession({
  secret: 's3cr3t',
  resave: false,
  saveUninitialized: false
}));

var mongoUri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/appdb';
var MongoClient = require('mongodb').MongoClient, format = require('util').format;
var db = MongoClient.connect(mongoUri, function(error, databaseConnection) {
  db = databaseConnection;
});

// This is a middleware that we will use on routes where
// we _require_ that a user is logged in, such as the /secret url
function requireUser(req, res, next){
  if (!req.user) {
    res.redirect('/not_allowed');
  } else {
    next();
  }
}

// This middleware checks if the user is logged in and sets
// req.user and res.locals.user appropriately if so.
function checkIfLoggedIn(req, res, next){
  if (req.session.username) {
    var coll = mongo.collection('players');
    coll.findOne({username: req.session.username}, function(err, user){
      if (user) {
        // set a 'user' property on req
        // so that the 'requireUser' middleware can check if the user is
        // logged in
        req.user = user;
      }
      
      next();
    });
  } else {
    next();
  }
}

// Register for an account
app.post('/register', function(request, response) {
	request.session.username = request.body.username;

	var username = request.body.username;
	var password = request.body.password;
	var password2 = request.body.password2;
	var name = request.body.name;

	if(!username || !password || !name || !password2) {
		return response.send("You're missing some data");
	}

	if(password != password2) {
		return response.send("Passwords don't match");
	}

	// TODO: make it so user cannot leave out photo to upload

	db.collection('players').find({username:username}).toArray(function(err, arr) {
		if (err) return response.send("Error in finding players in db");
		if (arr.length > 0) { 	// someone already has username
			return response.send("Username taken");
		}
			
		// var gameObj = {
		// 				"gameID":null,
		// 				"target":null,
		// 				"gameStatus":null,
		// 			  }

		var toInsert = {
			"username":username,
			"password":password,
			"name":name
		}

		var imgPath = request.files[0]["path"];
		// var link = service_root + "faces/detect?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&urls=" + server + imgPath;
		// for local server:
		var link = service_root + "faces/detect?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&urls=http://www.tvchoicemagazine.co.uk/sites/default/files/imagecache/interview_image/intex/michael_emerson.png";
		
		unirest.get(link,
					function(faceDetectResponse) {
						if (faceDetectResponse.error) {
							console.log('faceDetectResponse error');
							return response.status(500).send({message: "Error in face detection"});
						}

						var body = faceDetectResponse.body;
						var tags = "";

						// user should send one photo with only one face for calibration
						if (body.photos[0].tags) { 
							if (body.photos[0].tags.length > 1) {
								return response.status(400).send({message: "Send photo with only one face for calibration"});
							}
							else if (body.photos[0].tags.length === 1) {
								tags += body.photos[0].tags[0].tid + ',';
							}
						}
						

						// if no faces, error
						if (tags.length === 0) {
							return response.status(400).send({message: "no faces detected"});
						}

						// save tags
						unirest.get(service_root + "tags/save?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&uid=" + username + "@snapspace" + "&tids=" + tags,
									function(tagSaveResponse){
										if (tagSaveResponse.error) {
											return response.status(500).send(tagSaveResponse.error);										
										}

										// start face training
										unirest.get(service_root + "faces/train?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&uids=" + request.body.userid + "@snapspace",
													function(faceTrainResponse) {
														if (faceTrainResponse.error) {
															return response.status(500).send(faceTrainResponse.error);
														}

														console.log('successfully trained a face');

														// insert player to db
														db.collection('players').insert(toInsert, function(err, player){
															if (err) return response.send("failure on insert");		
														});
	
														response.set('Content-Type', 'text/html');
														response.redirect('/home');
													});
						});
		});
	});

});

// Login to account
app.post('/login', function(request, response) {
	request.session.username = request.body.username;

	var username = request.body.username;
	var password = request.body.password;

	db.collection('players').find({"username":username}).toArray(function(err, arr) {
		if (err) return response.send("Error logging in");
		if (arr.length === 0) return response.send("Username not found");
		// assumes only one doc with given username
		if (arr[0].password == password) {
			response.set('Content-Type', 'text/html');
			response.redirect('/home');
		} else {
			console.log("Wrong password. " + username + " tried logging in with " + password);
			response.send("Wrong password!");
		}
	});
});

// Homepage after login
app.get('/home', function(request, response) {
	var username = request.session.username;
	var indexPage = "<!DOCTYPE html><html><head><title>" + username + "'s Home</title></head><body>";
	var games = "<h1>My Games:</h1><ul>";

	//TODO: find a way to list games

	// db.collection('players').find({username:username}).toArray(function(err, arr) {
	// 	for (var i in arr.game) {
	// 		games += "<li><a href=''>Game " + arr.game[i] + "</a></li>";
	// 	}
	// })

	games += "</ul>"

	var content = "<hr><h1>Join a Game</h1>" +
				  '<form method="post" enctype="multipart/form-data" action="' + server + 'joinGame">' +
				  '<p>Enter Game ID: <input type="text" name="gameID"></p>' + 
				  '<input type="submit" value="Enter">';

	indexPage += games + content + "</body></html>"
	response.send(indexPage);
	
});

app.post('/joinGame', function(request, response) {
	gameID = request.body.gameID;
	username = request.session.username;

	// check if gameID is in use
	db.collection('games').find({gameID:gameID}).toArray(function(err, games) {
		if (err) return response.send('Error searching through db');
		if (games.length > 0 && games[0].started == true) { // gameID already used
			return response.send("Game ID already used. Please pick another.");
		}

		if (games.length == 1 && games[0].started == false) { // join lobby
			db.collection('games').update({gameID:gameID}, {$addToSet: {players: username}}, function(err, result) {
									   		if (err) return response.send('Failure to join game lobby');
									   		response.send(renderLobby(gameID));
								   		 });
		}

		else { // create the game
			var date = new Date();
			var toInsert = {
				gameID:gameID,
				players:[username],
				targets:[],
				status:[],
				started:false,
				date:date
			}

			db.collection('games').insert(toInsert, function(err, game) {
				if (err) return response.send('Failed to create game');

				console.log("Game " + gameID + " created");

				response.send(renderLobby(gameID));
			});
		}
	});

	// // check if gameID is in use
	// db.collection('players').find( {game: { $elemMatch: { gameID:gameID, gameStatus:{$ne:"waiting"} }} } ).toArray(function(err, arr) {
	// 	if (err) return response.send("Error");


	// 	if (arr.length > 0) { // gameID already used
	// 		return response.send('Game ID already used');
	// 	}

	// 	db.collection('players').find( {game: { $elemMatch: { gameID:gameID, gameStatus:"waiting" }} } ).toArray(function(err, arr) {
	// 		if (err) return response.send("Error");

	// 		// check if player is already in lobby
	// 		for (var i in arr) {
	// 			if (arr[i].username == username) {
	// 				return response.send('Already in game!');
	// 			}
	// 		}

	// 		game = {
	// 			"gameID":gameID,
	// 			"target":null,
	// 			"gameStatus":"waiting"
	// 		};

	// 		db.collection('players').find({username:username}).toArray(function(err, toJoin) {
	// 			if (err) return response.send("Oops! Something went wrong!");

	// 			toJoin[0].game.push(game);

	// 			db.collection('players').update(
	// 				{username: username},
	// 				{
	// 					$set: {
	// 						"game":toJoin[0].game
	// 					}
	// 				}

	// 			)

	// 		});

	// 		response.send(renderLobby(gameID));
	// 	});


	// });
});

function renderLobby(gameID) {
	var indexPage = "<!DOCTYPE html><html><head><title>" + gameID + " Lobby</title></head><body>"

	indexPage += "hello</body></html>"

	return indexPage
}


// TODO: make method for adding photos to train

// TODO: make method for resetting photos
// use tags/remove + faces/train

/****************************************************************************************************************************/
/****************************************************************************************************************************/
/*************************************** ALL OF THE FOLLOW CODE WILL BE CHANGED *********************************************/
/****************************************************************************************************************************/
/****************************************************************************************************************************/


// To recognize a face
// TODO: merge with assassinate button
app.post('/assassinate', function(request, response){ 
	unirest.get(service_root + "faces/recognize?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&uids=" + "emerson" + "&urls=https://peaceful-cove-69430.herokuapp.com/images/d6a3d42826dea771f2e6c09f41a0df7b" + "&namespace=snapspace",
				function(faceRecogResponse) {

					if(faceRecogResponse.error) {
						return response.status(500).send(faceRecogResponse.error);
					}
					// API can give success response, but not have detected any face
					else if (!faceRecogResponse.body.photos[0].tags || !faceRecogResponse.body.photos[0].tags[0]) {
						return response.status(400).send({message: "Sorry no faces detected"});
					}

					var uid = [];


					for (var i in faceRecogResponse.body.photos[0].tags) {	
						if (faceRecogResponse.body.photos[0].tags[i].uids) { // api has a guess who it is
							for (var j in faceRecogResponse.body.photos[0].tags[i].uids) {
								uid.unshift(faceRecogResponse.body.photos[0].tags[i].uids[j].uid);
							}
						}
					}

					console.log(faceRecogResponse.body)
					response.send(faceRecogResponse.body);
				});

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

app.get('/', function(request, response) {
	response.set('Content-Type', 'text/html');
	response.sendFile(__dirname + '/public/index.html');
});

app.listen(process.env.PORT || 3000);