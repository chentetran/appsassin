// Initialization
var express = require('express');

var bodyParser = require('body-parser'); // Required if we need to use HTTP query or post parameters
// var validator = require('validator');
var app = express();
// See https://stackoverflow.com/questions/5710358/how-to-get-post-query-in-express-node-js
app.use(bodyParser.json());
// See https://stackoverflow.com/questions/25471856/express-throws-error-as-body-parser-deprecated-undefined-extended
app.use(bodyParser.urlencoded({ extended: true })); // Required if we need to use HTTP query or post parameters

var mongoUri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/appdb';
var MongoClient = require('mongodb').MongoClient, format = require('util').format;
var db = MongoClient.connect(mongoUri, function(error, databaseConnection) {
  db = databaseConnection;
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
			shuffle(players_arr);

			var i = 0;

			// TODO: account for players being assigned to themselves

			cursor.find({gameID:gameID}).forEach(function(doc) {
				db.collection('players').update(
						{"_id":doc._id},
						{
							$set: {
								"target":players_arr[i].login
							}
						}
					)
				i++;
			});

			response.send('success');
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

	db.collection('players').find({"login":login, "gameID":gameID}).toArray(function(err, arr){
		if(err) response.send("couldn't find target");
		else {
			// assuming only one document found
			response.send(arr[0].target);
		}
	});
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