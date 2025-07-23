var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
require('dotenv').config();

// 調試：檢查環境變數
console.log('[DEBUG] GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log('[DEBUG] GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var ragRouter = require('./routes/rag');
var authRouter = require('./routes/auth'); 
var friendsRouter = require('./routes/friends'); // ADD THIS LINE 

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Enable CORS for all routes
// Enable CORS for all routes
app.use(cors());

app.use(express.static('public'));
app.use('/', indexRouter);
app.use('/api/users', require('./routes/users'));
app.use('/api/rag', ragRouter);
app.use('/api/auth', authRouter); // 
app.use('/api/friends', friendsRouter); // ADD THIS LINE

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;