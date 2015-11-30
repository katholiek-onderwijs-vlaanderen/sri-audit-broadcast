# Example #

To receive broadcast messages go to test page:
[https://vsko-audit-broadcast-api-test.herokuapp.com/test](Link URL)

Then run following script to create, update and delete a school (adapt to your userid, and eventually change school uuid or other details):


```
#!bash

export SERVER="https://testapi.vsko.be"

export SCHOOL=a2a3e6aa-a3a4-11e3-ace8-005056872b95
export SCHOOL_DUMP="/tmp/s"
export PERMALINK="/schools/${SCHOOL}"

curl http://api.vsko.be${PERMALINK} > ${SCHOOL_DUMP}

export FILE="/tmp/t"
export TS=`date -u +%FT%TZ`
export KEY=`uuidgen`

echo "{" > ${FILE}
echo "\"key\": \"${KEY}\"," >> ${FILE}
echo "\"timestamp\": \"${TS}\"," >> ${FILE}
echo "\"person\": \"/persons/cf2dccb2-c77c-4402-e044-d4856467bfb8\"," >> ${FILE}
echo "\"component\": \"/security/components/vos-api\"," >> ${FILE}
echo "\"operation\": \"CREATE\"," >> ${FILE}
echo "\"type\": \"SCHOOL\"," >> ${FILE}
echo "\"resource\": \"${PERMALINK}\"," >> ${FILE}
echo "\"document\": " >> ${FILE}
cat ${SCHOOL_DUMP} >> ${FILE}
echo "}" >> ${FILE}

curl -u johannes.govaerts -i -H "Content-Type: application/json" ${SERVER}/versions/${KEY} --upload-file ${FILE}

sleep 60

sed -i "s/029843/029850/g" ${SCHOOL_DUMP}

export TS=`date -u +%FT%TZ`
export KEY=`uuidgen`

echo "{" > ${FILE}
echo "\"key\": \"${KEY}\"," >> ${FILE}
echo "\"timestamp\": \"${TS}\"," >> ${FILE}
echo "\"person\": \"/persons/cf2dccb2-c77c-4402-e044-d4856467bfb8\"," >> ${FILE}
echo "\"component\": \"/security/components/vos-api\"," >> ${FILE}
echo "\"operation\": \"UPDATE\"," >> ${FILE}
echo "\"type\": \"SCHOOL\"," >> ${FILE}
echo "\"resource\": \"${PERMALINK}\"," >> ${FILE}
echo "\"document\": " >> ${FILE}
cat ${SCHOOL_DUMP} >> ${FILE}
echo "}" >> ${FILE}

curl -u johannes.govaerts -i -H "Content-Type: application/json" ${SERVER}/versions/${KEY} --upload-file ${FILE}

sleep 60

sed -i "s/Kapelsesteenweg/Kapelsebaan/" ${SCHOOL_DUMP}

export TS=`date -u +%FT%TZ`
export KEY=`uuidgen`

echo "{" > ${FILE}
echo "\"key\": \"${KEY}\"," >> ${FILE}
echo "\"timestamp\": \"${TS}\"," >> ${FILE}
echo "\"person\": \"/persons/cf2dccb2-c77c-4402-e044-d4856467bfb8\"," >> ${FILE}
echo "\"component\": \"/security/components/vos-api\"," >> ${FILE}
echo "\"operation\": \"UPDATE\"," >> ${FILE}
echo "\"type\": \"SCHOOL\"," >> ${FILE}
echo "\"resource\": \"${PERMALINK}\"," >> ${FILE}
echo "\"document\": " >> ${FILE}
cat ${SCHOOL_DUMP} >> ${FILE}
echo "}" >> ${FILE}

curl -u johannes.govaerts -i -H "Content-Type: application/json" ${SERVER}/versions/${KEY} --upload-file ${FILE}

sleep 60

export TS=`date -u +%FT%TZ`
export KEY=`uuidgen`

echo "{" > ${FILE}
echo "\"key\": \"${KEY}\"," >> ${FILE}
echo "\"timestamp\": \"${TS}\"," >> ${FILE}
echo "\"person\": \"/persons/cf2dccb2-c77c-4402-e044-d4856467bfb8\"," >> ${FILE}
echo "\"component\": \"/security/components/vos-api\"," >> ${FILE}
echo "\"operation\": \"DELETE\"," >> ${FILE}
echo "\"type\": \"SCHOOL\"," >> ${FILE}
echo "\"resource\": \"${PERMALINK}\"" >> ${FILE}
#echo "\"resource_key\": \"${SCHOOL}\"" >> ${FILE}
echo "}" >> ${FILE}

curl -u johannes.govaerts -i -H "Content-Type: application/json" ${SERVER}/versions/${KEY} --upload-file ${FILE}

```


