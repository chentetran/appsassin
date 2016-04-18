// Initialization
var express = require('express');
var multer = require('multer');
var bodyParser = require('body-parser'); // Required if we need to use HTTP query or post parameters
var unirest = require('unirest');
var formidable = require('formidable');
var util = require('util');
var fs = require('fs-extra');
var qt = require('quickthumb');

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
app.post('/uploadPhoto', function(request, response) {
	console.log('received')
	console.log(request.files);
	response.redirect('back');
});

// // faces/detect method for skybiometry
// app.post('/uploadPhoto', function(request, response){ 
// 	console.log("hello " + request.body.photo);
// 	unirest.get(service_root + "faces/detect?api_key=" + sky_api_key + "&api_secret=" + sky_api_secret + "&urls=" + request.body.photo,
// 				function(faceDetectResponse) {
// 					if (faceDetectResponse.error) {
// 						return response.status(500).send({message: faceDetectResponse.error});
// 					}

// 					console.log("working!!!!")
// 					var body = faceDetectResponse.body;
// 				});
// });

app.get('/', function(request, response) {
	response.sendFile(__dirname + 'public/index.html');
});

// receive login and gameID from client, returns json 
// json includes list of other players' logins
// if login not present in db, return empty json
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
app.get('/getTarget', function(request, response) {
	response.header("Access-Control-Allow-Origin", "*");
  	response.header("Access-Control-Allow-Headers", "X-Requested-With");

	var login = request.query.login;
	var gameID = Number(request.query.gameID);

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