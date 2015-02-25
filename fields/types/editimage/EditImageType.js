     ///
//D
// EditImageType.js - a local file analogue that uploads the contents of a canvas
// instead of the raw file.
//
///

var fs = require('fs-extra'),
	path = require('path'),
	_ = require('underscore'),
	moment = require('moment'),
	async = require('async'),
	util = require('util'),
	utils = require('keystone-utils'),
	super_ = require('../Type');

/**
 * editimage FieldType Constructor
 * @extends Field
 * @api public
 */
function editimage(list, path, options) {
	
	this._underscoreMethods = ['format', 'uploadImage'];
	this._fixedSize = 'full';

	// event queues
	this._pre = {
		move: [] // Before file is moved into final destination
	};

	this._post = {
		move: [] // After file is moved into final destination
	};
	
	// TODO: implement filtering, usage disabled for now
	options.nofilter = true;
	
	// TODO: implement initial form, usage disabled for now
	if (options.initial) {
		throw new Error('Invalid Configuration\n\n' +
			'editimage fields (' + list.key + '.' + path + ') do not currently support being used as initial fields.\n');
	}
	
	if (options.overwrite !== false) {
		options.overwrite = true;
	}
	
	editimage.super_.call(this, list, path, options);
	
	// validate destination dir
	if (!options.dest) {
		throw new Error('Invalid Configuration\n\n' +
			'editimage fields (' + list.key + '.' + path + ') require the "dest" option to be set.');
	}
	
	// Allow hook into before and after
	if (options.pre && options.pre.move) {
		this._pre.move = this._pre.move.concat(options.pre.move);
	}
	
	if (options.post && options.post.move) {
		this._post.move = this._post.move.concat(options.post.move);
	}
	
}

/*!
 * Inherit from Field
 */

util.inherits(editimage, super_);


/**
 * Allows you to add pre middleware after the field has been initialised
 *
 * @api public
 */

editimage.prototype.pre = function(event, fn) {
	if (!this._pre[event]) {
		throw new Error('editimage (' + this.list.key + '.' + this.path + ') error: editimage.pre()\n\n' +
			'Event ' + event + ' is not supported.\n');
	}
	this._pre[event].push(fn);
	return this;
};


/**
 * Allows you to add post middleware after the field has been initialised
 *
 * @api public
 */

editimage.prototype.post = function(event, fn) {
	if (!this._post[event]) {
		throw new Error('editimage (' + this.list.key + '.' + this.path + ') error: editimage.post()\n\n' +
			'Event ' + event + ' is not supported.\n');
	}
	this._post[event].push(fn);
	return this;
};


/**
 * Registers the field on the List's Mongoose Schema.
 *
 * @api public
 */

editimage.prototype.addToSchema = function() {
	
	var field = this,
		schema = this.list.schema;
	
	var paths = this.paths = {
		// fields
		filename:		this._path.append('.filename'),
		path:			this._path.append('.path'),
		size:			this._path.append('.size'),
		filetype:		this._path.append('.filetype'),
		// virtuals
		exists:			this._path.append('.exists'),
		href:			this._path.append('.href'),
		upload:			this._path.append('_upload'),
		action:			this._path.append('_action')
	};
	
	var schemaPaths = this._path.addTo({}, {
		filename:		String,
		path:			String,
		size:			Number,
		filetype:		String
	});
	
	schema.add(schemaPaths);
	
	// exists checks for a matching file at run-time
	var exists = function(item) {
		var filepath = item.get(paths.path),
			filename = item.get(paths.filename);

		if (!filepath || !filename) {
			return false;
		}

		return fs.existsSync(path.join(filepath, filename));
	};
	
	// The .exists virtual indicates whether a file is stored
	schema.virtual(paths.exists).get(function() {
		return schemaMethods.exists.apply(this);
	});
	
	// The .href virtual returns the public path of the file
	schema.virtual(paths.href).get(function() {
		return field.href.call(field, this);
	});
	
	// reset clears the value of the field
	var reset = function(item) {
		item.set(field.path, {
			filename: '',
			path: '',
			size: 0,
			filetype: ''
		});
	};

	var schemaMethods = {
		exists: function() {
			return exists(this);
		},
		/**
		 * Resets the value of the field
		 *
		 * @api public
		 */
		reset: function() {
			reset(this);
		},
		/**
		 * Deletes the file from editimage and resets the field
		 *
		 * @api public
		 */
		delete: function() {
			if (exists(this)) {
				fs.unlinkSync(path.join(this.get(paths.path), this.get(paths.filename)));
			}
			reset(this);
		}
	};

	_.each(schemaMethods, function(fn, key) {
		field.underscoreMethod(key, fn);
	});

	// expose a method on the field to call schema methods
	this.apply = function(item, method) {
		return schemaMethods[method].apply(item, Array.prototype.slice.call(arguments, 2));
	};

	this.bindUnderscoreMethods();
};


/**
 * Formats the field value
 *
 * Delegates to the options.format function if it exists.
 * @api public
 */

editimage.prototype.format = function(item) {
	if (!item.get(this.paths.filename)) return '';
	if (this.hasFormatter()) {
		var file = item.get(this.path);
		file.href = this.href(item);
		return this.options.format.call(this, item, file);
	}
	return this.href(item);
};


/**
 * Detects whether the field has formatter function
 *
 * @api public
 */

editimage.prototype.hasFormatter = function() {
	return 'function' === typeof this.options.format;
};


/**
 * Return the public href for the stored file
 *
 * @api public
 */

editimage.prototype.href = function(item) {
	if (!item.get(this.paths.filename)) return '';
	var prefix = this.options.prefix ? this.options.prefix : item.get(this.paths.path);
	return path.join(prefix, item.get(this.paths.filename));
};


/**
 * Detects whether the field has been modified
 *
 * @api public
 */

editimage.prototype.isModified = function(item) {
	return item.isModified(this.paths.path);
};


/**
 * Validates that a value for this field has been provided in a data object
 *
 * @api public
 */

editimage.prototype.validateInput = function(data) {
	// TODO - how should file field input be validated?
	return true;
};


/**
 * Updates the value for this field in the item from a data object
 *
 * @api public
 */

editimage.prototype.updateItem = function(item, data) {
	// TODO - direct updating of data (not via upload)
};


/**
 * Uploads the file for this field
 *
 * @api public
 */

editimage.prototype.uploadImage = function(item, file, update, callback) {

	var field = this,
		prefix = field.options.datePrefix ? moment().format(field.options.datePrefix) + '-' : '',
		filename = prefix + file.name,
		filetype = file.mimetype || file.type;
		
	console.log("editimage.prototype.uploadImage "+item+" "+file+" "+update+" ");

	if (field.options.allowedTypes && !_.contains(field.options.allowedTypes, filetype)) {
		return callback(new Error('Unsupported File Type: ' + filetype));
	}

	if ('function' === typeof update) {
		callback = update;
		update = false;
	}

	var doMove = function(callback) {
		
		if ('function' === typeof field.options.filename) {
			filename = field.options.filename(item, filename);
		}

		var destFileName = path.join(field.options.dest, filename);
		console.log("EditImage uploadImage doMove destFileName:"+destFileName);
		fs.move(file.path, path.join(field.options.dest, filename), { clobber: field.options.overwrite }, function(err) {
			
			if (err) return callback(err);

			var fileData = {
				filename: filename,
				path: field.options.dest,
				size: file.size,
				filetype: filetype
			};

			if (update) {
				item.set(field.path, fileData);
			}

			callback(null, fileData);
			
		});
	};

	async.eachSeries(this._pre.move, function(fn, next) {
		fn(item, file, next);
	}, function(err)
	{
		
		if (err) return callback(err);

		doMove(function(err, fileData)
		{
			if (err) return callback(err);

			async.eachSeries(field._post.move, function(fn, next)
			{
				fn(item, file, fileData, next);
			}, function(err) 
			{
				if (err) return callback(err);
				callback(null, fileData);
			});
		});
		
	});
};


/**
 * Returns a callback that handles a standard form submission for the field
 *
 * Expected form parts are
 * - `field.paths.action` in `req.body` (`clear` or `delete`)
 * - `field.paths.upload` in `req.files` (uploads the file to editimage)
 *
 * @api public
 */

editimage.prototype.getRequestHandler = function(item, req, paths, callback) {

	console.log("EditImage - getRequestHandler!");
	var field = this;
	console.log("paths: "+field.paths);
	console.log("files: ");
	console.dir(req.files);

	if (utils.isFunction(paths)) {
		callback = paths;
		paths = field.paths;
	} else if (!paths) {
		paths = field.paths;
	}

	callback = callback || function() {};

	return function() 
	{
		console.log("&&&&&&&&&&&&&&& EditImage - RequestHandler &&&&&&&&&&&&&&&&");

		if (req.body) {
			var action = req.body[paths.action];

			if (/^(delete|reset)$/.test(action)) {
				field.apply(item, action);
			}
		}

		console.log("&&& EditImage - paths.upload: "+paths.upload);
		var myFiles = req.files[paths.upload];
		if(myFiles)
		{			
			console.log("&&& EditImage - myFiles: "+JSON.stringify(myFiles));			
			console.log("myFiles.length "+myFiles.length);
			console.log("& EditImage - calling field.uploadImage");
			var myFile = myFiles[1];
			return field.uploadImage(item, myFile, true, callback);			
		}

		return callback();

	};

};


/**
 * Immediately handles a standard form submission for the field (see `getRequestHandler()`)
 *
 * @api public
 */

editimage.prototype.handleRequest = function(item, req, paths, callback) {
	this.getRequestHandler(item, req, paths, callback)();
};


/*!
 * Export class
 */

exports = module.exports = editimage;
