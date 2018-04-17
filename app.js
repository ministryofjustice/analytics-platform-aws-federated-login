require('dotenv').config();

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const nunjucks = require('nunjucks');
const passport = require('passport');
const session = require('express-session');
const { join } = require('path');
const Auth0Strategy = require('passport-auth0-openidconnect').Strategy;
const routes = require('./routes/index');
const RedisStore = require('connect-redis')(session);
const bole = require('bole');

const app = express();

bole.output({
  stream: process.stdout,
  level: process.env.NODE_LOG_LEVEL || 'debug',
});

const redisLogger = bole('redis');

// Passport setup
const strategy = new Auth0Strategy(
  {
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.AUTH0_CALLBACK_URL ||
                 'http://localhost:3000/callback',
    scope: 'openid profile email',
    passReqToCallback: true,
    prompt: 'none',
    sso_logout_url: '/v2/logout',
  },
  ((
    req, issuer, audience, profile, accessToken,
    refreshToken, params, callback,
  ) => {
    req.session.id_token = params.id_token;
    return callback(null, profile._json);
  }),
);
// Original implementation in `passport-openidconnect` ignore options by
// returning `{}`.
//
// `passport-auth0-openidconnect` is supposed to override it but it doesn't.
//
// See: https://github.com/siacomuzzi/passport-openidconnect/blob/master/lib/strategy.js#L338
Auth0Strategy.prototype.authorizationParams = (options) => options;
passport.use(strategy);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Nunjucks setup
nunjucks.configure(join(__dirname, 'templates'), {
  autoescape: true,
  express: app,
});
app.set('view engine', 'nunjucks');

app.use(cookieParser());
app.use(session({
  store: new RedisStore({
    host: process.env.REDIS_HOST || 'redis',
    port: 6379,
    pass: process.env.REDIS_PASSWORD,
    logErrors: redisLogger.error,
  }),
  secret: process.env.COOKIE_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 60 * 1000 }, // 30 minutes
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(favicon(`${__dirname}/public/favicon.ico`));
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));


// Routes setup
app.use('/', routes);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use((err, req, res) => {
    res.status(err.status || 500);
    res.render('error.html', {
      message: err.message,
      error: err,
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res) => {
  res.status(err.status || 500);
  res.render('error.html', {
    message: err.message,
    error: {},
  });
});


module.exports = app;
