/**
 * Backbone localStorage Adapter
 * Version 1.1.16
 *
 * https://github.com/jeromegn/Backbone.localStorage
 */

'use strict';

const Backbone = require('backbone');
const LocalStorage = require('node-localstorage').LocalStorage;
const localStorage = new LocalStorage('relay.backbone');
const Deferred = require('jquery-deferred').Deferred;

// A simple module to replace `Backbone.sync` with *localStorage*-based
// persistence. Models are given GUIDS, and saved into a JSON object. Simple
// as that.

// Generate four random hex digits.
function S4() {
   return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
};

// Generate a pseudo-GUID by concatenating random hexadecimal.
function guid() {
   return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
};

function isObject(item) {
  return item === Object(item);
}

function contains(array, item) {
  var i = array.length;
  while (i--) if (array[i] === item) return true;
  return false;
}

function extend(obj, props) {
  for (var key in props) obj[key] = props[key]
  return obj;
}

function result(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return (typeof value === 'function') ? object[property]() : value;
}

// Our Store is represented by a single JS object in *localStorage*. Create it
// with a meaningful name, like the name you'd give a table.
Backbone.LocalStorage = function(name, serializer) {
  if (!this.localStorage) {
    throw "Backbone.localStorage: Environment does not support localStorage."
  }
  this.name = name;
  this.serializer = serializer || {
    serialize: function(item) {
      return isObject(item) ? JSON.stringify(item) : item;
    },
    // fix for "illegal access" error on Android when JSON.parse is passed null
    deserialize: function (data) {
      return data && JSON.parse(data);
    }
  };
  var store = this.localStorage().getItem(this.name);
  this.records = (store && store.split(",")) || [];
};

extend(Backbone.LocalStorage.prototype, {
  save: function() {
    this.localStorage().setItem(this.name, this.records.join(","));
  },

  // Add a model, giving it a (hopefully)-unique GUID, if it doesn't already
  // have an id of it's own.
  create: function(model) {
    if (!model.id && model.id !== 0) {
      model.id = guid();
      model.set(model.idAttribute, model.id);
    }
    this.localStorage().setItem(this._itemName(model.id), this.serializer.serialize(model));
    this.records.push(model.id.toString());
    this.save();
    return this.find(model);
  },

  // Update a model by replacing its copy in `this.data`.
  update: function(model) {
    this.localStorage().setItem(this._itemName(model.id), this.serializer.serialize(model));
    var modelId = model.id.toString();
    if (!contains(this.records, modelId)) {
      this.records.push(modelId);
      this.save();
    }
    return this.find(model);
  },

  // Retrieve a model from `this.data` by id.
  find: function(model) {
    return this.serializer.deserialize(this.localStorage().getItem(this._itemName(model.id)));
  },

  // Return the array of all models currently in storage.
  findAll: function() {
    var result = [];
    for (var i = 0, id, data; i < this.records.length; i++) {
      id = this.records[i];
      data = this.serializer.deserialize(this.localStorage().getItem(this._itemName(id)));
      if (data != null) result.push(data);
    }
    return result;
  },

  // Delete a model from `this.data`, returning it.
  destroy: function(model) {
    this.localStorage().removeItem(this._itemName(model.id));
    var modelId = '' + model.id.toString();
    for (var i = 0, id; i < this.records.length; i++) {
      if (this.records[i] === modelId) {
        this.records.splice(i, 1);
      }
    }
    this.save();
    return model;
  },

  localStorage: function() {
    return localStorage;
  },

  // Clear localStorage for specific collection.
  _clear: function() {
    var local = this.localStorage(),
      itemRe = new RegExp("^" + this.name + "-");

    // Remove id-tracking item (e.g., "foo").
    local.removeItem(this.name);

    // Match all data items (e.g., "foo-ID") and remove.
    for (var k in local) {
      if (itemRe.test(k)) {
        local.removeItem(k);
      }
    }

    this.records.length = 0;
  },

  // Size of localStorage.
  _storageSize: function() {
    return this.localStorage().length;
  },

  _itemName: function(id) {
    return this.name+"-"+id;
  }

});

// localSync delegate to the model or collection's
// *localStorage* property, which should be an instance of `Store`.
Backbone.LocalStorage.sync = Backbone.localSync = function(method, model, options) {
    var store = result(model, 'localStorage') || result(model.collection, 'localStorage');

    var resp, errorMessage;
    var syncDfd = Deferred();

    switch (method) {
      case "read":
        resp = model.id != undefined ? store.find(model) : store.findAll();
        break;
      case "create":
        resp = store.create(model);
        break;
      case "update":
        resp = store.update(model);
        break;
      case "delete":
        resp = store.destroy(model);
        break;
    }
    if (resp) {
        if (options && options.success) {
            if (Backbone.VERSION === "0.9.10") {
                options.success(model, resp, options);
            } else {
                options.success(resp);
            }
        }
        syncDfd.resolve(resp);
    } else {
        errorMessage = errorMessage ? errorMessage : `Record Not Found: ${model.localStorage}:${model.id}`;
        if (options && options.error) {
            if (Backbone.VERSION === "0.9.10") {
                options.error(model, errorMessage, options);
            } else {
                options.error(errorMessage);
            }
        }
        syncDfd.reject(new Error(errorMessage));
    }

    // add compatibility with $.ajax
    // always execute callback for success and error
    if (options && options.complete) options.complete(resp);
    return syncDfd.promise();
};

Backbone.ajaxSync = Backbone.sync;

Backbone.getSyncMethod = function(model, options) {
  var forceAjaxSync = options && options.ajaxSync;

  if(!forceAjaxSync && (result(model, 'localStorage') || result(model.collection, 'localStorage'))) {
    return Backbone.LocalStorage.sync;
  }

  throw new Error(`Missing localStorage config for ${model.constructor.name}`);
};

Backbone.sync = function(method, model, options) {
  return Backbone.getSyncMethod(model, options).apply(this, [method, model, options]);
};

module.exports = Backbone;
