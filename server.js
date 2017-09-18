var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var redis = require('redis');

var app = express();

app.use(bodyParser.json());

var client = redis.createClient(process.env.REDIS_URL);

var lastFuelReading = 100.0;
var lastTripId = 'T';

app.get('/', function(req, res) {
	client.get('lastFuelReading', function(err, lastFuelReading) {
		if (lastFuelReading == null) {
			console.log ('Unable to retrieve lastFuelReading, setting to 100%');
			lastFuelReading = 100.0;
		}
		
		var result = '<!DOCTYPE html>' +
		'<html>' +
		'<head>' +
		'<style>' +
		'html { margin: 0; }' +
		'body { margin: 0; font-family: Consolas, Courier, Monospace; font-size: 100px; }' +
		'h1 { margin: 0; }' +
		'p { margin: 0; }' +
		'.outer { display: table; position: absolute; height: 100%; width: 100%; }' +
		'.middle { display: table-cell; vertical-align: middle; }' +
		'.inner { margin-left: auto; margin-right: auto; text-align: center; }' +
		'</style>' +
		'</head>' +
		'<body>' +
		'<div class=\'outer\'>' +
		'<div class=\'middle\'>' +
		'<div class=\'inner\'>' +
		'<h1>' + lastFuelReading + '%</h1>' +
		'<p>fuel remaining</p>' +
		'</div>' +
		'</div>' +
		'</div>' +
		'</body>' +
		'</html>';
		
		res.send(result);
	});
});

app.post('/webhook', function(req, res) {
	var payload = req.body;
	
	client.get('lastTripId', function(err, lastTripId) {
		if (lastTripId == null) {
			console.log ('Unable to retrieve lastTripId, setting to T');
			lastTripId = 'T';
		} else {
			console.log ('Updating lastTripId to ' + payload.trip.id);
			client.set('lastTripId', payload.trip.id);
		}
	});
	
	console.log('Vehicle ID: ' + payload.vehicle.id);
	
	console.log('Webhook received of type \'' + payload.type + '\'');
	
	if (payload.type == 'trip:finished' && payload.trip.id != lastTripId) {
		console.log('Checking remaining fuel in vehicle');
		
		request.get({
			uri: 'https://api.automatic.com/vehicle/' + payload.vehicle.id + '/',
			headers: {
				Authorization: 'Bearer ' + process.env.AUTOMATIC_ACCESS_TOKEN
			},
			json: true
		}, function(error, response, body) {
			if (body.fuel_level_percent == null) {
				console.log('Could not find current fuel percentage, skipping IFTTT');
			} else {
				console.log('Fuel level at ' + body.fuel_level_percent + '%');
				
				console.log('Sending IFTTT event to Maker service');
				
				request.post('https://maker.ifttt.com/trigger/automatic-ifttt/with/key/' + process.env.IFTTT_SECRET_KEY, {
					form: {
						value1: body.fuel_level_percent,
						value2: payload.location.lat,
						value3: payload.location.lon
					}
				}, function(err, response, body) {
					console.log('Succeeded');
				});
				
				client.get('lastFuelReading', function(err, lastFuelReading) {
					if (lastFuelReading == null) {
						console.log ('Unable to retrieve lastFuelReading, setting to 100%');
						lastFuelReading = 100.0;
					} else {
						console.log ('Updating lastFuelReading to ' + body.fuel_level_percent + '%');
						client.set('lastFuelReading', body.fuel_level_percent);
					}
				});
			}
		});
	} else {
		console.log('Ignored');
	}
	
	res.status(200).end();
});

app.listen(process.env.PORT || 3000);