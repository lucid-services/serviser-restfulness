-- Deploy restfulness:movies to pg

BEGIN;

    CREATE TABLE movies (
        id SERIAL PRIMARY KEY,
        name character varying(32),
        description character varying(256),
        released_at timestamp with time zone NOT NULL,
        rating decimal,
        country_id integer
    );

    ALTER TABLE ONLY movies ADD CONSTRAINT movies__name__key UNIQUE (name);
    ALTER TABLE ONLY movies ADD CONSTRAINT movies__country_id__fkey
        FOREIGN KEY (country_id) REFERENCES countries(id) ON UPDATE CASCADE ON DELETE CASCADE;

COMMIT;
