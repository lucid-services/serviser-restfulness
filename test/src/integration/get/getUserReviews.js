
describe('GET /api/v1.0/users/:column/reviews', function() {
    before(function() {
        return this.knex('users').insert({
            username: 'happie',
            password: 'secret',
            subscribed: false,
            email: 'email@email.com'
        }).returning('id').bind(this).then(function(result) {
            this.userId = result[0];

            const movieRows = [];
            for (let i = 0, len = 20; i < len; i++) {
                movieRows.push({
                    name: `Title${i+1}`,
                    description: `description${i+1}`,
                    released_at: '2018-01-10',
                    rating: 10
                });
            }

            return this.knex.batchInsert('movies', movieRows, 20).returning('id');
        }).then(function(ids) {
            this.movieIds = this.utils.expandResourceIds(ids, 20);

            const reviewRows = [];
            for (let i = 0, len = 20; i < len; i++) {
                reviewRows.push({
                    stars: 10,
                    comment: 'comment',
                    movie_id: this.movieIds[i],
                    user_id: this.userId
                });
            }
            return this.knex.batchInsert('reviews', reviewRows, 20).returning('id');
        }).then(function(ids) {
            this.reviewIds = this.utils.expandResourceIds(ids, 20);

            return this.knex('users').insert({
                username: 'happie22',
                password: 'secret2',
                subscribed: false,
                email: 'email2@email.com'
            }).returning('id');
        }).then(function(result) {
            this.userId2 = result[0];
        });
    });

    after(function() {
        return this.knex('reviews').whereIn('id', this.reviewIds)
            .del().bind(this).then(function() {
                return this.knex('movies').whereIn('id', this.movieIds).del();
            }).then(function() {
                return this.knex('users').whereIn('id', [this.userId, this.userId2]).del();
            });
    });

    it('should return (200 code) collection of all users` reviews', function() {
        const expect = this.expect;
        const userId = this.userId;
        const movieIds = this.movieIds;
        const reviewIds = this.reviewIds;

        return this.sdk.getUsersReviews(userId, {
            query: {
                _sort: 'id'
            }
        }).should.be.fulfilled.then(function(response) {
            expect(response.data.length).to.be.equal(20);

            response.data.forEach(function(review, index) {
                Object.keys(review).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id']);

                expect(review.id).to.equal(reviewIds[index]);
                expect(review.comment).to.equal('comment');
                expect(review.stars).to.equal(10);
                expect(review.movie_id).to.equal(movieIds[index]);
                expect(review.user_id).to.equal(userId);
            });
        });
    });

    it('should return collection of all users` reviews by users username', function() {
        const expect = this.expect;
        const userId = this.userId;
        const movieIds = this.movieIds;
        const reviewIds = this.reviewIds;

        return this.sdk.getUsersReviews('happie', {
            query: {
                _sort: 'id'
            }
        }).should.be.fulfilled.then(function(response) {
            expect(response.data.length).to.be.equal(20);

            response.data.forEach(function(review, index) {
                Object.keys(review).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id']);

                expect(review.id).to.equal(reviewIds[index]);
                expect(review.comment).to.equal('comment');
                expect(review.stars).to.equal(10);
                expect(review.movie_id).to.equal(movieIds[index]);
                expect(review.user_id).to.equal(userId);
            });
        });
    });

    it('should return collection of users` movies which match defined query filter parameters', function() {
        const expect = this.expect;
        const userId = this.userId;
        const movieIds = this.movieIds;
        const reviewIds = this.reviewIds;

        return this.sdk.getUsersReviews(userId, {
            query: {
                _sort: 'id',
                id: reviewIds[2]
            }
        }).should.be.fulfilled.then(function(response) {
            expect(response.data.length).to.be.equal(1);

            response.data.forEach(function(review, index) {
                Object.keys(review).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id']);

                expect(review.id).to.equal(reviewIds[2]);
                expect(review.comment).to.equal('comment');
                expect(review.stars).to.equal(10);
                expect(review.movie_id).to.equal(movieIds[2]);
                expect(review.user_id).to.equal(userId);
            });
        });
    });

    it('should embed movie resource in each users review resource', function() {
        const expect = this.expect;
        const userId = this.userId;
        const movieIds = this.movieIds;
        const reviewIds = this.reviewIds;

        return this.sdk.getUsersReviews(userId, {
            query: {
                _embed: 'movie',
                _sort: 'id'
            }
        }).should.be.fulfilled.then(function(response) {
            expect(response.status).to.be.equal(200);
            expect(response.data.length).to.be.equal(20);

            response.data.forEach(function(review, index) {
                Object.keys(review).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id', 'movie']);

                expect(review.id).to.equal(reviewIds[index]);
                expect(review.comment).to.equal('comment');
                expect(review.stars).to.equal(10);
                expect(review.movie_id).to.equal(movieIds[index]);
                expect(review.user_id).to.equal(userId);

                expect(review.movie.released_at).to.be.a('string');
                delete review.movie.released_at;

                expect(review.movie).to.eql({
                    id: movieIds[index],
                    name: `Title${index+1}`,
                    country_id: 0,
                    rating: 10
                });
            });
        });
    });

    it('should embed specific movie resource properties in each users review resource', function() {
        const expect = this.expect;
        const userId = this.userId;
        const movieIds = this.movieIds;
        const reviewIds = this.reviewIds;

        return this.sdk.getUsersReviews(userId, {
            query: {
                _embed: 'movie.name,movie.rating',
                _sort: 'id'
            }
        }).should.be.fulfilled.then(function(response) {
            expect(response.status).to.be.equal(200);
            expect(response.data.length).to.be.equal(20);

            response.data.forEach(function(review, index) {
                Object.keys(review).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id', 'movie']);

                expect(review.id).to.equal(reviewIds[index]);
                expect(review.comment).to.equal('comment');
                expect(review.stars).to.equal(10);
                expect(review.movie_id).to.equal(movieIds[index]);
                expect(review.user_id).to.equal(userId);

                expect(review.movie).to.eql({
                    name: `Title${index+1}`,
                    rating: 10
                });
            });
        });
    });

    it('should return 400 response when requested property to eager load doesnt exist or is private/internal only', function() {
        const expect = this.expect;

        return this.sdk.getUsersReviews(this.userId, {
            query: {_embed: 'user.password'}
        }).should.be.rejected.then(function(response) {
            expect(response.code).to.be.equal(400);
            response.message.should.match(/Invalid _embed parameter resource path/);
        });
    });

    it('should return 400 validation error response when _embed parameter is invalid', function() {
        const expect = this.expect;

        return this.sdk.getUsersReviews(this.userId, {
            query: {_embed: '$$&@!($)'}
        }).should.be.rejected.then(function(response) {
            expect(response.code).to.be.equal(400);
            expect(response.apiCode).to.be.equal('validationFailure');
        });
    });
});
