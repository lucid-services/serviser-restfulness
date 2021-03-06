
describe('DELETE /api/v1.0/users/:column/reviews', function() {
    beforeEach(function() {
        const self = this;
        return this.knex('users').insert({
            username: 'happie',
            password: 'secret',
            subscribed: false,
            email: 'email@email.com',
            created_at: self.knex.raw('now()'),
            updated_at: self.knex.raw('now()')
        }).returning('id').then(function(result) {
            self.userId = result[0];

            return self.knex('movies').insert({
                name: 'name',
                description: 'description',
                released_at: '2019-01-01',
                country_id: self.countryId,
                rating: 10
            }).returning('id');
        }).then(function(result) {
            self.movieId = result[0];

            return self.knex('movies').insert({
                name: 'name2',
                description: 'description',
                released_at: '2019-01-02',
                country_id: self.countryId,
                rating: 5
            }).returning('id');
        }).then(function(result) {
            self.movieId2 = result[0];

            return self.knex('reviews').insert({
                stars: 10,
                comment: 'comment',
                movie_id: self.movieId,
                user_id: self.userId
            }).returning('id');
        }).then(function(result) {
            self.reviewId = result[0];

            return self.knex('reviews').insert({
                stars: 5,
                comment: 'comment',
                movie_id: self.movieId2,
                user_id: self.userId
            }).returning('id');
        }).then(function(result) {
            self.reviewId2 = result[0];
        });
    });

    afterEach(function() {
        const self = this;
        return this.knex('reviews').whereIn('id', [this.reviewId, this.reviewId2])
            .del().then(function() {
                return self.knex('movies').whereIn('id', [self.movieId, self.movieId2]).del();
            }).then(function() {
                return self.knex('users').whereIn('id', [self.userId]).del();
            });
    });

    it('should remove all user reviews by user id and return 204 with correct x-total-count header', function() {
        const self = this;

        return this.sdk.deleteUsersReviews(self.userId).then(function(response) {
            self.expect(response.status).to.be.equal(204);
            self.expect(response.headers['x-total-count']).to.be.equal('2');

            return self.knex('users').where('id', self.userId).first().should.eventually.be.a('object');
        }).then(function(user) {
            return self.knex('movies').select().should.eventually.be.an('array').that.has.length(2);
        }).then(function() {
            return self.knex('reviews').select().should.eventually.be.an('array').that.is.empty;
        });
    });

    it('should remove all user reviews by user username and return 204 with correct x-total-count header', function() {
        const self = this;

        return this.sdk.deleteUsersReviews('happie').then(function(response) {
            self.expect(response.status).to.be.equal(204);
            self.expect(response.headers['x-total-count']).to.be.equal('2');

            return self.knex('users').where('id', self.userId).first().should.eventually.be.a('object');
        }).then(function(user) {
            return self.knex('movies').select().should.eventually.be.an('array').that.has.length(2);
        }).then(function() {
            return self.knex('reviews').select().should.eventually.be.an('array').that.is.empty;
        });
    });

    it('should remove user reviews with particular rating by user id and return 204 with correct x-total-count header', function() {
        const self = this;

        return this.sdk.deleteUsersReviews(self.userId, {
            query: {
                stars: 10
            }
        }).then(function(response) {
            self.expect(response.status).to.be.equal(204);
            self.expect(response.headers['x-total-count']).to.be.equal('1');

            return self.knex('users').where('id', self.userId).first().should.eventually.be.a('object');
        }).then(function(user) {
            return self.knex('movies').select().should.eventually.be.an('array').that.has.length(2);
        }).then(function() {
            return self.knex('reviews').first().should.eventually.be.a('object').that.has.property('id', self.reviewId2);
        });
    });

    describe('_filter', function() {
        it('should delete multiple review records based on provided query filter {id: {in: [<id1>]}}', function() {
            const self = this;

            return this.sdk.deleteUsersReviews(self.userId, {
                query: {
                    _filter: {id: {in:[self.reviewId]}}
                }
            }).then(function(response) {
                self.expect(response.status).to.be.equal(204);
                self.expect(response.headers['x-total-count']).to.be.equal('1');

                return self.knex('reviews').select().should.eventually.be.an('array')
                    .that.is.has.length(1).and.has.deep.property('[0].id', self.reviewId2);
            });
        });

        it('should return 400 json response with validation error when filter is applied to a non-primary key column', function() {
            const self = this;

            return this.sdk.deleteUsersReviews(self.userId, {
                query: {
                    _filter: {user_id: {eq: self.userId}}
                }
            }).should.be.rejected.then(function(response) {
                self.expect(response.code).to.be.equal(400);
                self.expect(response.apiCode).to.be.equal('validationFailure');
                self.expect(response.message).to.match(/._filter unsupported property user_id/);
            });
        });
    });

    it('should not delete anything and return 204 with correct x-total-count header', function() {
        const self = this;

        return this.sdk.deleteUsersReviews(self.userId, {
            query: {
                movie_id: self.movieId2 + 1
            }
        }).then(function(response) {
            self.expect(response.status).to.be.equal(204);
            self.expect(response.headers['x-total-count']).to.be.equal('0');

            return self.knex('users').where('id', self.userId).first().should.eventually.be.a('object');
        }).then(function(user) {
            return self.knex('movies').select().should.eventually.be.an('array').that.has.length(2);
        }).then(function() {
            return self.knex('reviews').select().should.eventually.be.an('array').that.has.length(2);
        });
    });

    it('should return 400 json response with validation error when username path parameter is invalid', function() {
        const expect = this.expect;

        return this.sdk.deleteUsersReviews('$!$@$!@').should.be.rejected.then(function(response) {
            expect(response.code).to.be.equal(400);
            expect(response.apiCode).to.be.equal('validationFailure');
            expect(response.message).to.be.equal('.username should match pattern "^[a-z0-9-_]+$"');
        });
    });
});
