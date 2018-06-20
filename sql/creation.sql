CREATE TYPE operation AS ENUM ('CREATE', 'UPDATE', 'DELETE','INITIALIZE', 'MERGE');

CREATE TABLE versions (
    key            UUID PRIMARY KEY,
    timestamp      timestamp without time zone NOT NULL default now(),
    person         VARCHAR(128) NOT NULL,
    component      VARCHAR(56) NOT NULL,
    operation      operation,
		mergedResource text,
    type           VARCHAR(60) NOT NULL,
    resource       VARCHAR(128) NOT NULL,
    document       json,
    "$$meta.deleted"   boolean default FALSE,
    "$$meta.modified"  timestamp with time zone not null default current_timestamp,
    "$$meta.created"   timestamp with time zone not null default current_timestamp
);

--CREATE INDEX ON versions(resource_key);
--CREATE INDEX ON versions(resource_key, type);
CREATE INDEX ON versions(resource);
CREATE INDEX ON versions((lower(person)));
CREATE INDEX ON versions((lower(component)));
CREATE INDEX ON versions(timestamp);

CREATE INDEX table_created ON versions ("$$meta.created");
CREATE INDEX table_modified ON versions ("$$meta.modified");
CREATE INDEX table_deleted ON versions ("$$meta.deleted");

CREATE VIEW versions_previous_next_view AS
select key,
first_value(key)
over(partition by resource
order by timestamp
rows between 1 preceding and current row) as previous,
last_value(key)
over(partition by resource
order by timestamp
rows between current row and 1 following) as next
from versions;


CREATE INDEX lower_case_versions_resource_idx ON versions ((lower(resource)));
