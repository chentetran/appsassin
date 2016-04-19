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

app.post('makeProfile')