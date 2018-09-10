const express = require('express');
const session = require('express-session');
var bodyParser = require('body-parser');
var request = require('request');
var redis = require('redis');
const port = process.env.PORT || 3000;
const app = express();

app.use(bodyParser.json());

var client = redis.createClient(process.env.REDIS_URL);

var lastFuelReading = 100.0;
var lastTripId = 'T';
var vehicle_id = process.env.VEHICLE_ID;

// Add your automatic client id and client secret here or as environment variables
const AUTOMATIC_CLIENT_ID = process.env.AUTOMATIC_CLIENT_ID || 'your-automatic-client-id';
const AUTOMATIC_CLIENT_SECRET = process.env.AUTOMATIC_CLIENT_SECRET || 'your-automatic-client-secret';

const oauth2 = require('simple-oauth2')({
  clientID: AUTOMATIC_CLIENT_ID,
  clientSecret: AUTOMATIC_CLIENT_SECRET,
  site: 'https://accounts.automatic.com',
  tokenPath: '/oauth/access_token'
});

// Authorization uri definition
const authorizationUri = oauth2.authCode.authorizeURL({
  scope: 'scope:user:profile scope:trip scope:location scope:vehicle:profile scope:vehicle:events scope:behavior'
});

// Enable sessions
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true }
}));

// Initial page redirecting to Automatic's oAuth page
app.get('/auth', (req, res) => {
  res.redirect(authorizationUri);
});

// Callback service parsing the authorization token and asking for the access token
app.get('/redirect', (req, res) => {
  const code = req.query.code;

  function saveToken(error, result) {
    if (error) {
      console.log('Access token error', error.message);
      res.send('Access token error: ' +  error.message);
      return;
    }

    // Attach `token` to the user's session for later use
    // This is where you could save the `token` to a database for later use
    req.session.token = oauth2.accessToken.create(result);
    console.log(req.session.token);
	
	client.set('refreshToken', req.session.token.token.refresh_token);
	client.get('refreshToken', function(err, refreshToken) {
		console.log('refresh token: ', refreshToken);
	});
	client.set('accessToken', req.session.token.token.access_token);
	client.get('accessToken', function(err, accessToken) {
		console.log('access token: ', accessToken);
	});
	
    res.redirect('/');
  }

  oauth2.authCode.getToken({
    code: code
  }, saveToken);
});

app.get('/welcome', (req, res) => {
  if (req.session.token) {
    // Display token to authenticated user
    console.log('Automatic access token', req.session.token.token.access_token);
    res.send('You are logged in.<br>Access Token: ' + req.session.token.token.access_token);
  } else {
    // No token, so redirect to login
    res.redirect('/');
  }
});

app.get('/', function(req, res) {
	
	client.get('lastFuelReading', function(err, lastFuelReading) {
		if (lastFuelReading == null) {
			console.log('Unable to retrieve lastFuelReading, setting to 100%');
			lastFuelReading = 100.0;
		}
		
		client.get('lastTripId', function(err, lastTripId) {
			if (lastTripId == null) {
				lastTripId = '?';
			}
			
			var loginstate = '';
			
			client.get('accessToken', function(err, accessToken) {
				request.get({
					uri: 'https://api.automatic.com/vehicle/' + vehicle_id + '/',
					headers: {
						Authorization: 'Bearer ' + accessToken || req.session.token.token.access_token
					},
					json: true
				}, function(error, response, body) {
					console.log('error: ' + error);
					console.log('response: ' + response);
					console.log('body: ' + body);
					if (!error) {
						accessToken = accessToken;
					} else {
						accessToken = null;
					}
				});
				
				if (accessToken) {
		    			// Display token to authenticated user
		    			console.log('Automatic access token', accessToken);
		    			loginstate = '<p class=\'loggedin\'>You are logged in.<br>Access Token: ' + accessToken + '</p>'
		  		} else {
		    			// No token, so redirect to login
		    			loginstate = '<a href=\'/auth\'><img src=\'https://developer.automatic.com/_assets/images/resources/auth-buttons/auth_automatic-connect-hover-32-01e4181455.svg\' height=\'32px\' /></a>'
		  		}
				
				var result = '<!DOCTYPE html>' +
							 '<html>' +
							 '<head>' +
							 '<title>' +
							 lastFuelReading +
							 '% Fuel Remaining</title>' +
							 '<link rel=\'apple-touch-icon\' href=\'https://store-images.s-microsoft.com/image/apps.17557.13510798887693184.f17a0156-31bb-4cd8-a528-bce93ba02099.a38af496-4d9b-4831-828e-f942c6126042?mode=crop&q=90&h=270&w=270&format=jpg&background=%23000000\'>' +
							 '<link rel=\'apple-touch-icon\' sizes=\'152x152\' href=\'https://store-images.s-microsoft.com/image/apps.17557.13510798887693184.f17a0156-31bb-4cd8-a528-bce93ba02099.a38af496-4d9b-4831-828e-f942c6126042?mode=crop&q=90&h=152&w=152&format=jpg&background=%23000000\'>' +
							 '<link rel=\'apple-touch-icon\' sizes=\'180x180\' href=\'https://store-images.s-microsoft.com/image/apps.17557.13510798887693184.f17a0156-31bb-4cd8-a528-bce93ba02099.a38af496-4d9b-4831-828e-f942c6126042?mode=crop&q=90&h=180&w=180&format=jpg&background=%23000000\'>' +
							 '<link rel=\'apple-touch-icon\' sizes=\'167x167\' href=\'https://store-images.s-microsoft.com/image/apps.17557.13510798887693184.f17a0156-31bb-4cd8-a528-bce93ba02099.a38af496-4d9b-4831-828e-f942c6126042?mode=crop&q=90&h=167&w=167&format=jpg&background=%23000000\'>' +
							 '<style>' +
							 'html { margin: 0; }' +
							 'body { margin: 0; font-family: Consolas, Courier, Monospace; font-size: 100px; text-align: center; }' +
							 'h1 { margin: 0; }' +
							 'p { margin: 0; }' +
							 '.loggedin { font-size: 12px; margin: 25px 0px 25px 0; display: table-cell; vertical-align: middle; height: 85px; width: 100%; }' +
							 '.regular { font-size: 12px; margin: 25px 0px 25px 0; display: table-cell; vertical-align: middle; height: 85px; width: 100%; }' +
							 'a { margin: 25px 0 25px 0; display: table-cell; vertical-align: middle; height: 85px; width: 100%; }' +
							 '.outer { display: table; position: absolute; height: 100%; width: 100%; }' +
							 '.middle { display: table-row; }' +
							 '.inner { margin-left: auto; margin-right: auto; text-align: center; display: table-cell; vertical-align: middle; }' +
							 '</style>' +
							 '</head>' +
							 '<body>' +
							 '<div class=\'outer\'>' +
							 loginstate +
							 '<div class=\'middle\'>' +
							 '<div class=\'inner\'>' +
							 '<h1>' + lastFuelReading + '%</h1>' +
							 '<p>fuel remaining</p>' +
							 '</div>' +
							 '</div>' +
							 '<p class=\'regular\'>' +
							 lastTripId +
							 '</p>' +
							 '</div>' +
							 '</body>' +
							 '</html>';
				
				res.send(result);
			});
		});
	});
});

app.post('/webhook', function(req, res) {
	var payload = req.body;
	
	console.log('Webhook received of type \'' + payload.type + '\'');
	console.log('vehicle id: ' + payload.vehicle.id);
	
	if (payload.type == 'trip:finished') {
		client.get('lastTripId', function(err, lastTripId) {
			if (lastTripId == null) {
				console.log('Unable to retrieve lastTripId, setting to T');
				lastTripId = 'T';
			}
			
			console.log('TripID: ' + payload.trip.id);
			
			if (payload.trip.id == process.env.TESTING_TRIP_ID || payload.trip.id != lastTripId) {
				if (payload.trip.id == process.env.TESTING_TRIP_ID) {
					console.log('Testing trip.id, checking remaining fuel in vehicle');
				} else {
					console.log('New trip.id, checking remaining fuel in vehicle');
				}
				
				client.get('accessToken', function(err, accessToken) {
					console.log('access token: ', accessToken);
					
					request.get({
						uri: 'https://api.automatic.com/vehicle/' + payload.vehicle.id + '/',
						headers: {
							Authorization: 'Bearer ' + accessToken || req.session.token.token.access_token
						},
						json: true
					}, function(error, response, body) {
						if (body.fuel_level_percent == null) {
							console.log('Could not find current fuel percentage, skipping IFTTT');
						} else {
							client.get('lastFuelReading', function(err, lastFuelReading) {
								if (lastFuelReading == null) {
									console.log ('Unable to retrieve lastFuelReading, setting to 100% and skipping IFTTT');
									lastFuelReading = 100.0;
									client.set('lastFuelReading', lastFuelReading);
								} else if (body.fuel_level_percent != lastFuelReading) {
									console.log('Fuel level at ' + body.fuel_level_percent + '%, sending to IFTTT Maker service');
									
									request.post('https://maker.ifttt.com/trigger/automatic-ifttt/with/key/' + process.env.IFTTT_SECRET_KEY, {
										form: {
											value1: body.fuel_level_percent,
											value2: payload.location.lat,
											value3: payload.location.lon
										}
									}, function(err, response, body) {
										console.log('IFTTT Success!');
									});
									
									console.log ('Updating lastFuelReading to ' + body.fuel_level_percent + '%');
									client.set('lastFuelReading', body.fuel_level_percent);
								} else {
									console.log ('Same fuel level %, skipping IFTTT');
								}
							});
						}
					});
				});
				
				console.log ('Updating lastTripId to ' + payload.trip.id);
				client.set('lastTripId', payload.trip.id);
			} else {
				console.log('Repeat trip.id, skipping fuel level check');
			}
		});
	} else {
		console.log('Not of type trip:finished');
	}
	
	res.status(200).end();
});

app.listen(process.env.PORT || 3000);
