'use strict';

var raven = require('raven');
var layouts = require('log4js').layouts;
var levels = require('log4js').levels;

var levelMapping = {};
levelMapping[levels.ALL] = 'debug';
levelMapping[levels.TRACE] = 'debug';
levelMapping[levels.DEBUG] = 'debug';
levelMapping[levels.INFO] = 'info';
levelMapping[levels.WARN] = 'warning';
levelMapping[levels.ERROR] = 'error';
levelMapping[levels.FATAL] = 'fatal';

exports.appender = sentryAppender;
exports.configure = configure;
exports.shutdown = shutdown;

var active = 0;
var shutdownCallbacks = [];

/**
 * The appender function.
 *
 * @param {String} dsn The Sentry URL to post events to.
 * @param {String} layout The layout to use to format the message.
 * @param {String} level The log level to use as an override for the main category level.
 *
 * @return {Function} Returns the
 */
function sentryAppender(client, layout, level) {
  layout = layout || layouts.messagePassThroughLayout;

    return function(logEvent) {
      // Check if the log level is enabled
      if (level && !logEvent.level.isGreaterThanOrEqualTo(level)) return;

      // Format the log message
      var message = layout(logEvent);

      var kwargs = {};
      kwargs.level = levelMapping[logEvent.level.toString().toLowerCase()];
      kwargs.logger = logEvent.categoryName;

      var data = logEvent.data;
      if (data.length > 1) {
        kwargs.logentry = {
          message: data[0],
          params: data.slice(1)
        };
      }

      var errors = data.filter(function(item) {
        return item instanceof Error;
      });

      active++;
      if (errors.length) {
        kwargs.message = message;
        client.captureException(errors[0], kwargs);
      } else {
        client.captureMessage(message, kwargs);
      }
    };
}

/**
 * Configures the appender.
 * @param  {Object} config The options to apply.
 * @return {Function} Returns the response from the sentryAppender() function.
 */
function configure(config) {
  var layout;
  if (config.layout) {
    layout = layouts.layout(config.layout.type, config.layout);
  }
  var options = config.options || {};
  var client = new raven.Client(config.dsn, options);
  client.addListener('logged', complete);
  client.addListener('error', complete);
  return sentryAppender(client, layout, config.level);
}

/**
 * Handler for raven capture methods
 */
function complete() {
  active--;
  if (active === 0) {
    shutdown();
  }
}

/**
 * Configures the appender.
 * @param {Function} config The options to apply.
 */
function shutdown(cb) {
  if (cb) {
    shutdownCallbacks.push(cb);
  }
  if (active === 0) {
    shutdownCallbacks.forEach(function(fn) {
      fn(null);
    });
    shutdownCallbacks = [];
  }
}
