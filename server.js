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

var server = "http://peaceful-cove-69430.herokuapp.com/";
// var server = "http://localhost:3000/"

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

var mongoUri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://heroku_9j5jdjrb:b03itk1jq0sfjs4frffj73f57o@ds011311.mlab.com:11311/heroku_9j5jdjrb';
var MongoClient = require('mongodb').MongoClient, format = require('util').format;
var db = MongoClient.connect(mongoUri, function(error, databaseConnection) {
  db = databaseConnection;
});

// This is a middleware that we will use on routes where
// we _require_ that a user is logged in, such as the /secret url
// function requireUser(req, res, next){
//   if (!req.user) {
//     res.redirect('/not_allowed');
//   } else {
//     next();
//   }
// }

// This middleware checks if the user is logged in and sets
// req.user and res.locals.user appropriately if so.
// function checkIfLoggedIn(req, res, next){
//   if (req.session.username) {
//     var coll = mongo.collection('players');
//     coll.findOne({username: req.session.username}, function(err, user){
//       if (user) {
//         // set a 'user' property on req
//         // so that the 'requireUser' middleware can check if the user is
//         // logged in
//         req.user = user;
//       }
      
//       next();
//     });
//   } else {
//     next();
//   }
// }

// TODO: if new player registers for acc and uses same photo as someone else, other person's name will be overwritten in namespace. fix!

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

	if (request.files.length === 0) {
		return response.send('You have to upload a photo');
	}

	db.collection('players').find({username:username}).toArray(function(err, arr) {
		if (err) return response.send("Error in finding players in db");
		if (arr.length > 0) { 	// someone already has username
			return response.send("Username taken");
		}

		var toInsert = {
			"username":username,
			"password":password,
			"name":name,
			"games":[]
		}

		var imgPath = request.files[0]["path"];
		var link = service_root + "faces/detect?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&urls=" + server + imgPath;
		// for local server:
		// var link = service_root + "faces/detect?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&urls=http://www.tvchoicemagazine.co.uk/sites/default/files/imagecache/interview_image/intex/michael_emerson.png";
		
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

														console.log('successfully trained a face for ' + username);

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

	// Listing games
	db.collection('players').find({username:username}).toArray(function(err, arr) {
		if (err) return response.send("Error listing games");

		for (var i in arr[0].games) {
			game = arr[0].games[i];
			games += "<li><a href='" + server + "renderLobby?gameID=" + game + "'>Game " + game + "</a></li>";
		}
		games += "</ul>";

		var content = "<hr><h1>Join a Game</h1>" +
					  '<form method="post" enctype="multipart/form-data" action="' + server + 'joinGame">' +
					  '<p>Enter Game ID: <input type="text" name="gameID"></p>' + 
					  '<input type="submit" value="Enter">';

		indexPage += games + content + "</body></html>"
		response.send(indexPage);
	});

	// db.collection('players').find({username:username}).toArray(function(err, arr) {
	// 	for (var i in arr.game) {
	// 		games += "<li><a href=''>Game " + arr.game[i] + "</a></li>";
	// 	}
	// })

	
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
									   		if (err) response.send('Failure to join game lobby');
									   		addGameID(username, gameID);
									   		request.session.gameID = gameID;
											response.redirect('renderLobby?gameID=' + gameID);
								   		 });
		}

		else { // create the game
			var date = new Date();
			var toInsert = {
				gameID:gameID,
				players:[username],
				targets:[],
				dead:[],
				started:false,
				date:date
			}

			db.collection('games').insert(toInsert, function(err, game) {
				if (err) return response.send('Failed to create game');

				console.log("Game " + gameID + " created");

				addGameID(username, gameID);

				request.session.username = username;
				response.redirect('renderLobby?gameID=' + gameID);
			});
		}

	});
});

// add gameID to player's list of games
function addGameID(username, gameID) {
	db.collection('players').update({username:username}, {$addToSet: {games:gameID}}, function(err, result) {
		if (err) response.send("Error adding gameID to player's array of games");

	});
}

// TODO: find a module for real time updating of players in lobby - Maybe socket.io? -> would help for chat functionality too
app.get('/renderLobby', function(request, response) {
	gameID = request.query.gameID;
	username = request.session.username;

	// a non-player is trying to view the game
	if(!username) return response.send('You cannot see this game lobby');


	var indexPage = "<!DOCTYPE html><html><head><title>" + gameID + " Lobby</title></head><body>"

	indexPage += "<h1>Game " + gameID + "</h1>";

	indexPage += "<h1>Players in game:</h1><ul>";

	db.collection('games').find({gameID:gameID}).toArray(function(err, playersInGame){
		if (err) return response.send('failed to load');
	
		for (var i in playersInGame[0].players) {
			indexPage += "<li>" + playersInGame[0].players[i] + "</li>";
		}
		indexPage += "</ul><hr><h1>Assassinated:</h1><ol>";
		for (var i in playersInGame[0].dead) {
			indexPage += "<li>" + playersInGame[0].dead[i] + "</li>";
		}
		indexPage += "</ol><hr>";

		// check if game has started
	  	if (playersInGame[0].started == true) {
	  		indexPage += "<h3>Game in progress</h3>";

	  		db.collection('games').find({gameID:gameID}).toArray(function(err, arr) {
				var playersInGame = arr[0].players;
				var i;
				for (i = 0; i < playersInGame.length; i++) {
					if (playersInGame[i] == username) {
						break;
					}
				}

				var target = arr[0].targets[i];
				request.session.target = target;
				request.session.username = username;
				request.session.gameID = gameID;
				indexPage += "<h3>Your target is " + target + "</h3>" +
							 '<form method="post" enctype="multipart/form-data" action="' + server + 'assassinate">' +
							 '<input type="file" name="photo">' + 
							 '<input type="submit" value="Assassinate"> Upload a photo of your target and click assassinate</form>';

				if (request.session.killFailed) {  		// sent here because assassination attempt failed
					request.session.killFailed = false;
					indexPage += "<h1 style='color:red'>Assassination failed</h1>"
				}


				indexPage += "</body></html>";
				response.send(indexPage);
			});

	  	}
		else if (playersInGame[0].started == false) { // game hasn't 
			request.session.gameID = gameID;
			indexPage += "<form method='post' enctype='multipart/form-data' action='" + server + "assignTargets'><input type='submit' value='Start Game'></form>" + "</body></html>"
			indexPage += "</ul></body></html>";
			response.send(indexPage);
		}
		else { // game has ended
			indexPage += "<h2>The winner is " + playersInGame[0].started + "</h2>";
			indexPage += "</ul></body></html>";
			response.send(indexPage);
		}

		// TODO: option to leave lobby
		// indexPage += "</ul><hr><form method='post' enctype='multipart/form-data' action ='" + server + ""leave lobby get mthod
		// delete game from player's games list
		// db.collection('players').update({username:username},{$pull:{games:gameID}}, function(err, result) {
		// 	if (err) return response.send('Failure to delete game from game list of player');
		// });
	});
});
// TODO: make method for adding photos to train

// TODO: make method for resetting photos
// use tags/remove + faces/train

// assign targets to players
app.post('/assignTargets', function(request, response) {
	response.header("Access-Control-Allow-Origin", "*");
  	response.header("Access-Control-Allow-Headers", "X-Requested-With");

  	gameID = request.session.gameID;

  	db.collection('games').find({gameID:gameID}).toArray(function(err, arr) {
  		if (err) return response.send('Failed searching game');

  		var players = arr[0].players;
  		var targets = arr[0].players;
  		var temp;
  		var len = players.length;

  		sattoloCycle(targets);

  		db.collection('games').update({gameID:gameID}, {$set:{targets: targets,started:true}}, function(err, result) {
  			if (err) return response.send('Failed to assign targets');
  			db.collection('games').find({gameID:gameID}).toArray(function(error, res) {
  				response.redirect('renderLobby?gameID=' + gameID);
  			});
  		});
  	});	
});

function sattoloCycle(items) {
  for(var i = items.length; i-- > 1; ) {
    var j = Math.floor(Math.random() * i);
    var tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}

app.post('/assassinate', function(request, response) {
	var username = request.session.username;
	var gameID = request.session.gameID;
	var target = request.session.target;
	var newTarget;
	var indexToRemove;

	if (request.files.length === 0) {
		return response.send('You have to upload a photo');
	}

	var imgPath = request.files[0]["path"];
	
	var link = service_root + "faces/recognize.json?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&uids=" + target + "@snapspace&urls=" + server + imgPath;

	unirest.get(link, function(faceRecogResponse) {
		if (faceRecogResponse.error) {
			return response.send('Failure to recognize face');
		}
		
		// api can give success response, but not have detected any face
		if (faceRecogResponse.body.photos[0].tags.length === 0) {
			request.session.killFailed = true;
			console.log('no face detected. see image at ' + imgPath);
			return response.redirect('renderLobby?gameID=' + gameID);
		}

		var uid = [];
		var threshold = [];
		var confidence = [];

		for (var i in faceRecogResponse.body.photos[0].tags) {
			if (faceRecogResponse.body.photos[0].tags[i].uids) { // has a guess who it is
				for (var j in faceRecogResponse.body.photos[0].tags[i].uids) {
					uid.push(faceRecogResponse.body.photos[0].tags[i].uids[j].uid);
					confidence.push(faceRecogResponse.body.photos[0].tags[i].uids[j].confidence);
					threshold.push(faceRecogResponse.body.photos[0].tags[i].threshold);
				}
			}
		}

		// search through uid[] and see if target is in there
		for (var i in uid) {
			if (target + "@snapspace" == uid[i] && confidence[i] > threshold[i]) { // got em!
				// assign next target
				db.collection('games').find({gameID:gameID}).toArray(function(err, arr) {
					if (err) return response.send('fail');

					var playersInGame = arr[0].players;

					// find new target
					for (var i in playersInGame) {
						if (target == playersInGame[i]) {
							newTarget = arr[0].targets[i];
							indexToRemove = i;
						}
					}

					// delete target and target's target from arrays	
					playersInGame.splice(indexToRemove, 1);
					arr[0].targets.splice(indexToRemove, 1);

					// if self assigned as target, player has won
					if (username == newTarget) {
						playersInGame = [username];

						db.collection('games').update({gameID:gameID}, {$set: {started:username,players:playersInGame}, $addToSet: {dead:target}}, function(err, result) {
							if (err) return response.send('failure in ending game');

							return response.redirect('renderLobby?gameID=' + gameID);
						});
					}
					else {
						// set new target
						for (var i in playersInGame) {
							if (username == playersInGame[i]) {
								arr[0].targets[i] = newTarget;
							}
						}

						db.collection('games').update({gameID:gameID}, {$set: {players:playersInGame, targets:arr[0].targets}, $addToSet: {dead:target}}, function(err, result) {
							if (err) return response.send('fail2');

							else return response.redirect("renderLobby?gameID=" + gameID);
						});
					}
			 	});
			}
		}
		// kill failed
		console.log('kill failed');
		request.session.killFailed = true;
		return response.redirect('renderLobby?gameID=' + gameID);
	
	});


});

app.get('/', function(request, response) {
	response.set('Content-Type', 'text/html');
	response.sendFile(__dirname + '/public/index.html');
});

app.listen(process.env.PORT || 3000);