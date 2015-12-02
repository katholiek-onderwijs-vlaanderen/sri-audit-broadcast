#!/bin/bash
if [ $OSTYPE == 'linux-gnu' ]
then
  export PSQL_CMD="sudo sudo -u postgres psql $PSQL_VERSION_OPT"
else
  export PSQL_CMD="psql -U postgres"
fi
echo Operating system $OSTYPE, using postgres command : $PSQL_CMD

# create database
cat sql/creation.sql | $PSQL_CMD
