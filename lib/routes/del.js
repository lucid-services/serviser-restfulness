const routeUtils = require('./route.js');
const sqlUtils   = require('../sqlUtils.js');
const queryFilter = require('../queryFilter.js');

const GoneError = require('../error/gone410Error.js');
const NoContent204 = require('../error/notContent204Response.js');
const RequestError = require('serviser').error.RequestError;

module.exports = del;

/**
 * @param {String} [url]
 * @param {Object} [options] - route options
 * @this {Router}
 *
 * @return {Route}
 */
function del(url, options) {
    options = options || {};

    const route = routeUtils._buildRoute.call(this, Object.assign(options, {
        url: url,
        type: 'delete'
    }));

    const querySegments = route.$restfulness.querySegments;
    const lastSegment = querySegments.last();
    const firstSegment = querySegments[0];

    if (!lastSegment.isReduced()) {
        route.reducesDatasetBy = routeUtils.reducesDatasetBy;
        route.respondsWith(RequestError);
    }

    /*
     * give the user time to set route specific validators and then, during the
     * next tick, set the fallbacks
     */
    process.nextTick(function() {
        routeUtils._settleRouteValidators(route);
        if (!lastSegment.isReduced()) {
            //setup _filter validation schema based on already seetled
            //route response schema
            routeUtils._acceptFilterParameter(route);
        }


        if (!routeUtils._isImplemented(route)) {
            route.respondsWith(NoContent204);

            if (lastSegment.isReduced()) {
                route.respondsWith(GoneError);
                route.description.summary = `delete ${lastSegment.resource.getName()}`;
            } else {
                route.description.summary = `delete matching ${lastSegment.resource.getPluralName()}`;
            }

            if (querySegments.length === 1) {
                //eg. api/users
                //or
                //eg. api/users/:id
                route.main(delViaSingleResourceQuery);
            } else if (firstSegment.isReduced()) {
                //eg. api/users/:id/movies/:id
                //or
                //eg. api/users/:id/movies
                const association = lastSegment.resource.getAssociation(
                    firstSegment.resource
                );
                switch (association.type) {
                    case 'MxM':
                        if (lastSegment.isReduced()) {
                            route.description.summary = `deassociate ` +
                                `${firstSegment.resource.getName()} from ` +
                                `${lastSegment.resource.getName()}`;
                        } else {
                            route.description.summary = `deassociate matching` +
                                `${lastSegment.resource.getPluralName()} from ` +
                                `${firstSegment.resource.getName()}`;
                        }
                        route.main(delViaManyToManyQuery);
                        break;
                    case '1xM':
                        let msg = 'Endpoint pattern DELETE /@resource/:column/@resource' +
                            ' not supported for one to one associations';
                        throw new Error(msg);
                        break;
                    case '1x1':
                        route.main(delViaOneToOneQuery);
                        break;
                }

            } else {
                throw new Error('Unsupported multi resource url query');
            }
        }
    });

    return route;
}

/**
 * implements routes matching url pattern:
 * DELETE /api/@resource/:column
 * or
 * DELETE /api/@resource
 * @param {Req} req
 * @param {Res} res
 * @this {Object} request context object
 */
function delViaSingleResourceQuery(req, res) {
    const route = this.route;
    const knex = this.app.service.resourceManager.get('knex');
    const segment = this.route.$restfulness.querySegments.last();
    const resource = segment.resource;
    const tableName = resource.getTableName();
    const where = {};

    if (this.$restfulness) {
        var filter = this.$restfulness.filter;
    }

    return knex.transaction(function(trx) {
        const query = trx(tableName);

        if (segment.isReduced()) {
            where[tableName + '.' + segment.getOriginalPropertyName()]
                = req.params[segment.getPropertyName()];
            query.where(where);
        } else {
            query.modify(sqlUtils.withWhere, req.query, resource);
        }

        query.modify(queryFilter.withFilter, filter, resource);
        query.modify(sqlUtils.removeWithSoftDelete, resource);

        return route.emitAsync('before-query', req, query).then(function() {
            return query.catch(routeUtils._transformKnexError);
        })
    }).then(_response(route, res, segment));
}

/**
 * implements routes matching url pattern:
 * DELETE /api/@resource/:column/@resource/:column
 * or
 * DELETE /api/@resource/:column/@resource
 * for resources having many to many relationship
 *
 * @param {Req} req
 * @param {Res} res
 * @this {Object} request context object
 */
function delViaManyToManyQuery(req, res) {
    const route = this.route;
    const knex = this.app.service.resourceManager.get('knex');
    const lastSegment = this.route.$restfulness.querySegments.last();
    const firstSegment = this.route.$restfulness.querySegments[0];
    const firstResource = firstSegment.resource;
    const secondResource = lastSegment.resource;
    const association = secondResource.getAssociation(firstSegment.resource);
    const pivotTableName = association.through.resource.getTableName();

    if (this.$restfulness) {
        var filter = this.$restfulness.filter;
    }

    return knex.transaction(function(trx) {
        const where = {};
        const query = trx(pivotTableName);

        if (firstSegment.getOriginalPropertyName() !== firstResource.getKeyName()) {
            query.whereIn(
                pivotTableName + '.' + association.through.foreignKey,
                firstResourceSubQuery
            );
        } else {
            where[pivotTableName + '.' + association.through.foreignKey]
                = req.params[firstSegment.getPropertyName()];
        }

        if (lastSegment.isReduced()
            && lastSegment.getOriginalPropertyName() === secondResource.getKeyName()
        ) {
            where[pivotTableName + '.' + association.through.localKey]
                = req.params[lastSegment.getPropertyName()];
        } else {
            query.whereIn(
                pivotTableName + '.' + association.through.localKey,
                secondResourceSubQuery
            );
        }

        query.where(where);
        query.modify(sqlUtils.removeWithSoftDelete, association.through.resource);

        return route.emitAsync('before-query', req, query).then(function() {
            return query.catch(routeUtils._transformKnexError)
        });
    }).then(_response(route, res, lastSegment));

    function firstResourceSubQuery() {
        const q = this.select(association.foreignKey);
        let where = {};

        where[firstResource.getTableName() + '.' + firstSegment.getOriginalPropertyName()]
            = req.params[firstSegment.getPropertyName()];

        //TODO knex bug, start event not emitted for subquery
        //q.modify(sqlUtils.withTimestamps, firstResource);
        return q.from(firstResource.getTableName()).where(where);
    }

    function secondResourceSubQuery() {
        let where = {};
        const q = this.select(association.localKey);

        if (lastSegment.isReduced()) {
            where[secondResource.getTableName() + '.' + lastSegment.getOriginalPropertyName()]
                = req.params[lastSegment.getPropertyName()];
        } else {
            q.modify(queryFilter.withFilter, filter, secondResource);
            q.modify(sqlUtils.withWhere, req.query, secondResource);
        }

        //TODO knex bug, start event not emitted for subquery
        //q.modify(sqlUtils.withTimestamps, secondResource);
        return q.from(secondResource.getTableName()).where(where);
    }
}

/**
 * implements routes matching url pattern:
 * DELETE /api/@resource/:column/@resource/:column
 * or
 * DELETE /api/@resource/:column/@resource
 * for resources having one to one relationship
 *
 * @param {Req} req
 * @param {Res} res
 * @this {Object} request context object
 */
function delViaOneToOneQuery(req, res) {
    const route = this.route;
    const knex = this.app.service.resourceManager.get('knex');
    const firstSegment = this.route.$restfulness.querySegments[0];
    const firstResource = firstSegment.resource;
    const lastSegment = this.route.$restfulness.querySegments.last();
    const secondResource = lastSegment.resource;
    const association = secondResource.getAssociation(firstResource);
    const tableName = secondResource.getTableName();

    if (this.$restfulness) {
        var filter = this.$restfulness.filter;
    }

    return knex.transaction(function(trx) {
        const where = {};
        const query = trx(tableName);

        if (firstSegment.getOriginalPropertyName() !== firstResource.getKeyName()) {
            query.whereIn(tableName + '.' + association.localKey, firstResourceSubQuery);
        } else {
            where[tableName + '.' + association.localKey]
                = req.params[firstSegment.getPropertyName()];
        }

        if (lastSegment.isReduced()) {
            where[tableName + '.' + lastSegment.getOriginalPropertyName()]
                = req.params[lastSegment.getPropertyName()];
        } else {
            query.modify(sqlUtils.withWhere, req.query, secondResource);
            query.modify(queryFilter.withFilter, filter, secondResource);
        }

        query.where(where);
        query.modify(sqlUtils.removeWithSoftDelete, secondResource);

        return route.emitAsync('before-query', req, query).then(function() {
            return query.catch(routeUtils._transformKnexError)
        });
    }).then(_response(route, res, lastSegment));

    function firstResourceSubQuery() {
        const q = this.select(association.foreignKey);
        let where = {};
        where[firstResource.getTableName() + '.' + firstSegment.getOriginalPropertyName()]
            = req.params[firstSegment.getPropertyName()];

        //TODO knex bug, start event not emitted for subquery
        q.modify(sqlUtils.withTimestamps, firstResource);
        return q.from(firstResource.getTableName()).where(where);
    }
}

/**
 * @private
 * @param {Route} route
 * @param {Response} res
 * @param {QuerySegment} segment
 * @return {Function}
 */
function _response(route, res, segment) {
    return function(count) {
        return route.emitAsync('before-response', res.req, count).then(function() {
            if (!res.req.headersSent) {
                if (segment.isReduced() && !count) {
                    throw new GoneError();
                } else {
                    res.setHeader('x-total-count', count);
                }
                res.status(204);
                res.end();
            }
        });
    }
}
