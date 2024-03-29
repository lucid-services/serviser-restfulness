const _       = require('lodash');
const Service = require('serviser');

module.exports = Resource;

const util             = require('./utils');
const sqlUtils         = require('./sqlUtils.js');
const ResourceRegistry = require('./resourceRegistry.js');

/**
 * @public
 * @constructor
 *
 * @param {Object} options
 * @param {String} options.singular - singular resource segment name
 * @param {String} options.plural - plural resource segment name
 * @param {Object} options.properties - json-schema
 * @param {Object} [options.db]
 * @param {String} [options.db.table]
 * @param {Object} [options.db.key]
 * @param {String} [options.db.key.name=id] - primary key name
 * @param {String} [options.db.key.type=integer] - string|integer
 * @param {Object} [options.responseProperties] - json-schema, defaults to properties object
 * @param {Object} [options.dynamicDefaults] - [ajv-keywords dynamicDefaults](https://github.com/epoberezkin/ajv-keywords#dynamicdefaults)
 */
function Resource(options) {
    util.validateResourceOptions(options);
    this.options = options;

    /**
     * @name Resource#_associations
     * @private
     * @instance
     * @type
     *
     * indexed by resource plural name
     * {
     *     additionalProperties: {
     *         type: 'object',
     *         required: ['type', 'foreignKey', 'localKey'],
     *         properties: {
     *             type: {
     *                 type: 'string',
     *                 enum: ['1x1', '1xM', 'MxM']
     *             },
     *             foreignKey: { type: 'string', minLength: 1 },
     *             localKey: { type: 'string', minLength: 1 },
     *             through: {
     *                 type: 'object',
     *                 properties: {
     *                     resource: { type: 'object', instanceof: 'Resource},
     *                     foreignKey: { $ref: '#/properties/foreignKey' },
     *                     localKey: { $ref: '#/properties/localKey' }
     *                 }
     *             }
     *         }
     *     }
     * }
     */
    this._associations = {};

    this.CREATED_AT = this.options.CREATED_AT;
    this.UPDATED_AT = this.options.UPDATED_AT;
    this.DELETED_AT = this.options.DELETED_AT;

    if (!this.options.hasOwnProperty('responseProperties')) {
        this._setDefaultResponseProperties();
    }

    Resource.registry.add(this);
}

/**
 * constructor
 * @name Service.Resource
 * @type {Resource}
 * @readonly
 */
Resource.Resource = Resource;

/**
 * @name Service.registry
 * @type {ResourceRegistry}
 * @readonly
 */
Resource.registry = new ResourceRegistry;


/**
 * @private
 * @return {Object}
 */
Resource.prototype._setDefaultResponseProperties = function() {
    const responseProperties = Object.assign({}, this.getProperties());

    if (!responseProperties.hasOwnProperty(this.getKeyName())) {
        responseProperties[this.getKeyName()]
            = _.omit(this.options.db.key, ['name']);
    }

    if (this.hasTimestamps()) {

        const dateTimePropSchema = {
            type: 'string',
            format: 'date-time'
        };

        if (!responseProperties.hasOwnProperty(this.CREATED_AT)) {
            responseProperties[this.CREATED_AT]
                = Object.assign({}, dateTimePropSchema);
        }

        if (!responseProperties.hasOwnProperty(this.UPDATED_AT)) {
            responseProperties[this.UPDATED_AT]
                = Object.assign({}, dateTimePropSchema);
        }
    }

    this.options.responseProperties = responseProperties;
};

/**
 * returns either plural or singular form of resource name depending on provided
 * `count` argument value
 * @param {Integer} [count=1]
 * @return {String}
 */
Resource.prototype.getName = function(count) {
    if (typeof count !== 'number' ||  count <= 1) {
        return this.options.singular;
    } else {
        return this.options.plural;
    }
};

/**
 * returns plural form of resource name
 * @return {String}
 */
Resource.prototype.getPluralName = function() {
    return this.options.plural;
};

/**
 * @return {String}
 */
Resource.prototype.getTableName = function() {
    return this.options.db.table;
};

/**
 * @return {String}
 */
Resource.prototype.getKeyName = function() {
    return this.options.db.key.name;
};


/**
 * @return {Object}
 */
Resource.prototype.getDynamicDefaults = function() {
    if (this.options.hasOwnProperty('dynamicDefaults')) {
        return this.options.dynamicDefaults;
    }

    return {};
};

/**
 * @return {Object}
 */
Resource.prototype.getResponseProperties = function() {
    if (this.options.hasOwnProperty('responseProperties')) {
        return this.options.responseProperties;
    }

    return this.options.properties;
};

/**
 * constructs list of properties that are required to be set
 * when creating a new resoruce
 * @return {Array<String>}
 */
Resource.prototype.getRequiredProperties = function() {
    const required = [];
    const dynamicDefaults = this.getDynamicDefaults();
    const properties = this.getProperties();
    const propNames = Object.keys(properties);

    for (let i = 0, len = propNames.length; i < len; i++) {
        let name = propNames[i];

        if (dynamicDefaults.hasOwnProperty(name)
            || this.prop(name).hasOwnProperty('default')
            || this.prop(name).nullable
        ) {
            continue;
        }

        required.push(name);
    }

    return required;
};

/**
 * @return {Object}
 */
Resource.prototype.getProperties = function() {
    return this.options.properties;
};


/**
 * constructs a list of original resource properties excluding those which
 * refenrence other properties
 * @private
 * @return {Array<Object>}
 */
Resource.prototype._getCommonProperties = function() {
    const self = this;
    const out = [];
    const _ids = [];

    _.each(this.options.properties, cb);
    if (this.options.hasOwnProperty('responseProperties')) {
        _.each(this.options.responseProperties, cb);
    }

    return out;

    function cb(prop, propName, props) {
        if (prop && !prop.hasOwnProperty('$ref')) {
            let id = self.getName() + '.' + propName;
            if (!_ids.includes(id)) {
                out.push(Object.assign({
                    $id: id
                }, prop));
                _ids.push(id);
            }
        }
    }
};

/**
 * returns resource property schema descriptor
 * @return {Object}
 */
Resource.prototype.prop = function(name) {
    if (this.options.properties.hasOwnProperty(name)) {
        return this.options.properties[name];
    } else if(_.isPlainObject(this.options.responseProperties)
        && this.options.responseProperties.hasOwnProperty(name)
    ) {
        return this.options.responseProperties[name];
    }

    throw new Error(`${this.getPluralName()} resource - no such property: ${name}`);
};

/**
 * @param {String} name
 * @return {Boolean}
 */
Resource.prototype.hasProp = function(name) {
    try {
        return !!this.prop(name);
    } catch(e) {
        return false;
    }
};

/**
 * @param {String} [timestamp] - this.CREATED_AT | this.UPDATED_AT | this.DELETED_AT
 * @return {Boolean}
 */
Resource.prototype.hasTimestamps = function(timestamp) {
    if (typeof timestamp === 'undefined') {
        return this.options.timestamps;
    }

    if ([this.CREATED_AT, this.UPDATED_AT].includes(timestamp)
        && this.options.timestamps
    ) {
        return true;
    } else if (timestamp === this.DELETED_AT && this.options.softDelete) {
        return true;
    }

    return false;
};

/**
 * @param {Knex}
 * @param {...Resource} [resource]
 * @return {KnexBuilder}
 */
Resource.prototype.query = function(knex) {
    const args = Array.prototype.slice.call(arguments, 1);
    const resource = this;
    const query = knex(this.getTableName());

    args.push(resource);
    args.unshift(sqlUtils.withTimestamps);
    query.modify.apply(query, args);

    const del = query.del;
    query.del = function delWithSoftDelete() {
        if (resource.hasTimestamps(resource.DELETED_AT)) {
            const now = query.client.raw('now()');
            return query.update(resource.DELETED_AT, now);
        }
        return del.apply(query);
    };

    return query;
};

/**
 * @return {Array<String>}
 */
Resource.prototype.getAssociatedResourceNames = function() {
    return Object.keys(this._associations);
};


/**
 * @param {Resource|String} [resource] - resource object or plural resource name
 * @param {String} [assocType] - 1x1|1xM|MxM - resource argument must be provided
 * @return {Boolean}
 */
Resource.prototype.hasAssociation = function(resource, assocType) {
    if (resource === undefined) {
        return _.isEmpty(this._associations) ? false : true;
    } else if (resource instanceof Resource) {
        let has = this._associations.hasOwnProperty(resource.getPluralName());
        if (typeof assocType !== 'undefined') {
            return has
                && this._associations[resource.getPluralName()].type === assocType;
        } else {
            return has;
        }
    } else if (typeof resource === 'string') {
        let has = this._associations.hasOwnProperty(resource);

        if (typeof assocType !== 'undefined') {
            return has
                && this._associations[resource].type === assocType;
        } else {
            return has;
        }
    } else {
        throw new TypeError('First optional argument of resource.hasAssociation must be a string or instanceof Resource.');
    }
};

/**
 * @param {String} associationType - 1x1|1xM|MxM
 * @return {Boolean}
 */
Resource.prototype.hasAnyAssociationOfType = function(associationType) {
    let resourceNames = Object.keys(this._associations);

    for (let i = 0, len = resourceNames.length; i < len; i++) {
        if (this._associations[resourceNames[i]].type === associationType) {
            return true;
        }
    }

    return false;
};


/**
 * @param {Resource|String} resource - resource object or plural resource name
 * @throws {Error}
 * @return {Object}
 */
Resource.prototype.getAssociation = function(resource) {
    if (this.hasAssociation(resource)) {
        let index = typeof resource == 'string' ? resource : resource.getPluralName();
        return this._associations[index];
    }
    throw new Error(`No such association: ${resource}`);
};

/**
 * defines One to One relationship between two resources, the relationship can
 * also be self-referencing (aka. within a single resource)
 *
 * @param {Resource} resource
 * @param {Object} [options]
 * @param {String} [options.foreignKey]
 * @param {String} [options.localKey]
 *
 * @throws {TypeError}
 * @return {undefined}
 */
Resource.prototype.belongsTo = function(resource, options) {

    if (!(resource instanceof Resource)) {
        throw new TypeError('First argument of belongsTo method must be an instance of Resource');
    }

    //
    if (this._associations.hasOwnProperty(resource.getPluralName())
        && this._associations[resource.getPluralName()].type === '1x1'
    ) {
        return;
    }

    const defaults = {
        foreignKey: resource.getKeyName(),
        localKey: `${resource.getName()}_${resource.getKeyName()}`,
    };

    options = _.assign(defaults, options);

    //test that local key exists
    //TODO fix tests
    //this.prop(options.localKey);

    this._associations[resource.getPluralName()] = {
        type: '1x1',
        foreignKey: options.foreignKey,
        localKey: options.localKey
    };

    if (!resource.hasAssociation(this)) {
        resource.hasMany(this, {
            foreignKey: options.localKey,
            localKey: options.foreignKey
        });
    }
};

/**
 * defines One to One relationship between two resources
 *
 * @param {Resource} resource
 * @param {Object} [options]
 * @param {String} [options.foreignKey]
 * @param {String} [options.localKey]
 *
 * @throws {TypeError}
 * @return {undefined}
 */
Resource.prototype.hasOne = function(resource, options) {

    if (!(resource instanceof Resource)) {
        throw new TypeError('First argument of belongsTo method must be an instance of Resource');
    }

    //
    if (this._associations.hasOwnProperty(resource.getPluralName())
        && this._associations[resource.getPluralName()].type === '1x1'
    ) {
        return;
    }

    const defaults = {
        foreignKey: `${this.getName()}_${this.getKeyName()}`,
        localKey: this.getKeyName(),
    };

    options = _.assign(defaults, options);

    //test that local key exists
    //TODO fix tests
    //this.prop(options.localKey);

    this._associations[resource.getPluralName()] = {
        type: '1x1',
        foreignKey: options.foreignKey,
        localKey: options.localKey
    };

    if (!resource.hasAssociation(this)) {
        resource.belongsTo(this, {
            foreignKey: options.localKey,
            localKey: options.foreignKey
        });
    }
};


/**
 * defines One to Many relationship between source and target resources
 *
 * @param {Resource} resource
 * @param {Object} [options]
 * @param {String} [options.foreignKey]
 * @param {String} [options.localKey]
 *
 * @throws {TypeError}
 * @return {undefined}
 */
Resource.prototype.hasMany = function(resource, options) {

    if (!(resource instanceof Resource)) {
        throw new TypeError('First argument of hasMany method must be an instance of Resource');
    }

    //
    if (this._associations.hasOwnProperty(resource.getPluralName())
        && this._associations[resource.getPluralName()].type === '1xM'
    ) {
        return;
    }

    const defaults = {
        foreignKey: `${this.getName()}_${this.getKeyName()}`,
        localKey: this.getKeyName(),
    };

    options = _.assign(defaults, options);

    this._associations[resource.getPluralName()] = {
        type: '1xM',
        foreignKey: options.foreignKey,
        localKey: options.localKey
    };

    if (!resource.hasAssociation(this)) {
        resource.belongsTo(this, {
            foreignKey: options.localKey,
            localKey: options.foreignKey
        });
    }
};


/**
 * defines Many to Many relationship between source and target resources through
 * pivot resource
 *
 * @param {Resource} resource
 * @param {Object} options
 * @param {String} [options.foreignKey]
 * @param {String} [options.localKey]
 * @param {Object} [options.through]
 * @param {Resource} [options.through.resource]
 * @param {String} [options.through.localKey]
 * @param {String} [options.through.foreignKey]
 *
 * @throws {TypeError}
 * @return {undefined}
 */
Resource.prototype.belongsToMany = function(resource, options) {

    if (!(resource instanceof Resource)) {
        throw new TypeError('First argument of belongsToMany method must be an instance of Resource');
    }

    //
    if (this._associations.hasOwnProperty(resource.getPluralName())
        && this._associations[resource.getPluralName()].type === 'MxM'
    ) {
        return;
    }

    const defaults = {
        foreignKey: resource.getKeyName(),
        localKey: this.getKeyName(),
        through: {
            foreignKey: `${resource.getName()}_${resource.getKeyName()}`,
            localKey: `${this.getName()}_${this.getKeyName()}`,
        }
    };

    options = _.merge(defaults, options);

    if (!_.has(options, ['through', 'resource'])
        || !(options.through.resource instanceof Resource)
    ) {
        options.through.resource = _buildPivotResource(this, resource);
    }

    this._associations[resource.getPluralName()] = {
        type: 'MxM',
        foreignKey: options.foreignKey,
        localKey: options.localKey,
        through: options.through
    };

    resource._associations[this.getPluralName()] = {
        type: 'MxM',
        foreignKey: options.localKey,
        localKey: options.foreignKey,
        through: {
            resource: options.through.resource,
            foreignKey: options.through.localKey,
            localKey: options.through.foreignKey
        }
    };
};

/**
 * @param {Resource} resource
 * @param {Resource} resource2
 * @private
 * @return {Resource}
 */
function _buildPivotResource(resource, resource2) {
    const sortedResources = _sortResourcesByName(resource, resource2);

    const pluralPivotName = sortedResources.map(function(res) {
        return res.getPluralName();
    }).join('_');

    const singularPivotName = sortedResources.map(function(res) {
        return res.getName();
    }).join('_');

    if (Resource.registry.hasSingularName(singularPivotName)) {
        return Resource.registry.getBySingularName(singularPivotName);
    }

    const properties = {};

    [resource, resource2].forEach(function(res) {
        let schema;

        if (res.hasProp(res.getKeyName())) {
            schema = _.cloneDeep(res.prop(res.getKeyName()));
        } else {
            schema = {type: res.options.db.key.type};
        }

        properties[`${res.getName()}_${res.getKeyName()}`] = schema;
    });

    return new Resource({
        singular: singularPivotName,
        plural: pluralPivotName,
        properties: properties
    });
}

/**
 * @param {...Resource} res
 * @return {Array<Resource>}
 */
function _sortResourcesByName(/*res1, res2, ...*/) {
    const pool = Array.prototype.slice.call(arguments, 0);
    return _.sortBy(pool, function(res) {
        return res.getName();
    });
}
