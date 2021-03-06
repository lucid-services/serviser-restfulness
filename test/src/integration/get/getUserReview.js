
describe('GET /api/v1.0/users/:user_id/reviews/:review_id', function() {
    before(function() {
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

            return self.knex('reviews').insert({
                stars: 10,
                comment: 'comment',
                movie_id: self.movieId,
                user_id: self.userId
            }).returning('id');
        }).then(function(result) {
            self.reviewId = result[0];
            return self.knex('users').insert({
                username: 'happie22',
                password: 'secret2',
                subscribed: false,
                email: 'email2@email.com',
                created_at: self.knex.raw('now()'),
                updated_at: self.knex.raw('now()')
            }).returning('id');
        }).then(function(result) {
            self.userWithoutReviewId = result[0];

            return self.knex('users').insert({
                username: 'happie33',
                password: 'secret3',
                subscribed: false,
                email: 'email3@email.com',
                created_at: self.knex.raw('now()'),
                updated_at: self.knex.raw('now()'),
                deleted_at: self.knex.raw('now()')
            }).returning('id');
        }).then(function(result) {
            self.deletedUserId = result[0];

            return self.knex('reviews').insert({
                stars: 10,
                comment: 'comment',
                movie_id: self.movieId,
                user_id: self.deletedUserId
            }).returning('id');
        }).then(function(result) {
            self.reviewId2 = result[0];
        });
    });

    after(function() {
        const self = this;

        return self.knex('reviews').whereIn('id', [self.reviewId, self.reviewId2])
            .del().then(function() {
                return self.knex('movies').whereIn('id', [self.movieId]).del();
            }).then(function() {
                return self.knex('users').whereIn('id', [self.userId, self.userWithoutReviewId, self.deletedUserId]).del();
            });
    });

    it('should fetch users review resource by user id', function() {
        const expect = this.expect;
        const userId = this.userId;
        const reviewId = this.reviewId;
        const movieId = this.movieId;

        return this.sdk.getUsersReview(userId, reviewId).then(function(response) {
            Object.keys(response.data).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id']);

            expect(response.data.id).to.equal(reviewId);
            expect(response.data.comment).to.equal('comment');
            expect(response.data.stars).to.equal(10);
            expect(response.data.movie_id).to.equal(movieId);
            expect(response.data.user_id).to.equal(userId);
        });
    });

    it('should fetch users review resource by user username', function() {
        const expect = this.expect;
        const userId = this.userId;
        const reviewId = this.reviewId;
        const movieId = this.movieId;

        return this.sdk.getUsersReview('happie', reviewId).then(function(response) {
            Object.keys(response.data).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id']);

            expect(response.data.id).to.equal(reviewId);
            expect(response.data.comment).to.equal('comment');
            expect(response.data.stars).to.equal(10);
            expect(response.data.movie_id).to.equal(movieId);
            expect(response.data.user_id).to.equal(userId);
        });
    });

    it('should embed user & movie resources in the review response', function() {
        const expect = this.expect;
        const userId = this.userId;
        const movieId = this.movieId;
        const reviewId = this.reviewId;

        return this.sdk.getUsersReview(userId, reviewId, {
            query: {_embed: 'movie,user'}
        }).then(function(response) {
            Object.keys(response.data).should.be.eql(['id', 'stars', 'comment', 'movie_id', 'user_id', 'movie', 'user']);

            expect(response.data.id).to.equal(reviewId);
            expect(response.data.comment).to.equal('comment');
            expect(response.data.stars).to.equal(10);
            expect(response.data.movie_id).to.equal(movieId);
            expect(response.data.user_id).to.equal(userId);

            expect(response.data.user.created_at).to.be.a('string');
            expect(response.data.user.updated_at).to.be.a('string');
            expect(response.data.movie.released_at).to.be.a('string');

            delete response.data.user.created_at;
            delete response.data.user.updated_at;
            delete response.data.movie.released_at;

            expect(response.data.user).to.be.eql({
                id: userId,
                username: 'happie',
                subscribed: false
            });

            expect(response.data.movie).to.be.eql({
                id: movieId,
                name: 'name',
                country_id: 0,
                rating: 10
            });
        });
    });

    it('should return 400 json response with review.notFound api code when association does NOT exist', function() {
        const expect = this.expect;

        return this.sdk.getUsersReview(this.userWithoutReviewId, this.reviewId).should.be.rejected.then(function(response) {
            expect(response.code).to.be.equal(400);
            expect(response.apiCode).to.be.equal('review.notFound');
            expect(response.message).to.be.equal('review not found');
        });
    });

    it('should return 400 json response with review.notFound api code when requesting review of soft deleted user resource', function() {
        const expect = this.expect;

        return this.sdk.getUsersReview(this.deletedUserId, this.reviewId2).should.be.rejected.then(function(response) {
            expect(response.code).to.be.equal(400);
            expect(response.apiCode).to.be.equal('review.notFound');
            expect(response.message).to.be.equal('review not found');
        });
    });
});
