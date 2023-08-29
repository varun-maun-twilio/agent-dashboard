const { FixedLoginAndPasswordAuthProvider, ContextDeferredAuthProvider, default: bearFactory } = require("@gooddata/sdk-backend-bear");
const { newPositiveAttributeFilter, newNegativeAttributeFilter, newAttributeSort, newTwoDimensional, MeasureGroupIdentifier } = require("@gooddata/sdk-model");
const { numberFormat } = require("@gooddata/numberjs");
const { newAttribute, newMeasure, idRef } = require("@gooddata/sdk-model");
const fs = require('fs');
var moment = require('moment-timezone');
var momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(moment);


const GoodDataConfig = JSON.parse(fs.readFileSync('./\.gdcatalogrc', 'utf8'));
const GDCatalogExportJSON = require("./metadata.json");


let GDBackend = null;
let GDWorkspace = GoodDataConfig['projectId'];




//Helper function to lookup attribute
const a = (label) => newAttribute(label);

//Helper function to lookup measure
const m = (label) => newMeasure(idRef(GDCatalogExportJSON.measures[label]?.identifier, "measure"));

//Helper function to initialize GD session
const setupGoodDataSession = () => {
    const backendObj = bearFactory({ hostname: GoodDataConfig['hostname'] }).withAuthentication(new ContextDeferredAuthProvider())
    GDBackend = backendObj.withAuthentication(new FixedLoginAndPasswordAuthProvider(GoodDataConfig['username'], GoodDataConfig['password']));
}



//Helper function to transform custom GD execution to table data
const extractTabularData = (executeAllResponse) => {
    const rowCount = executeAllResponse.totalCount[0];
    const tableData = [];
    const dim1ColCount = executeAllResponse.headerItems[0].length;

    const colFormats = executeAllResponse.result.dimensions[1].headers[0].measureGroupHeader.items.map(x => { return { name: x.measureHeaderItem.name, format: x.measureHeaderItem.format } });

    for (var rowIter = 0; rowIter < rowCount; rowIter++) {
        const rowData = [];
        for (var colIter = 0; colIter < dim1ColCount; colIter++) {
            rowData.push(executeAllResponse.headerItems[0][colIter][rowIter]['attributeHeaderItem']['name']);
        }


        const formattedMeasures = executeAllResponse.data[rowIter].map((y, yIter) => {
            try {

                return (colFormats[yIter].format ?
                    numberFormat(y, colFormats[yIter].format) : y)

            } catch (e) {
                return "NA";
            }
        })



        tableData.push(rowData.concat(formattedMeasures));
    }






    const headerLabels = [
        ...executeAllResponse.result.dimensions[0].headers.map(x => x.attributeHeader.name),
        ...executeAllResponse.result.dimensions[1].headers[0].measureGroupHeader.items.map(x => x.measureHeaderItem.name)
    ];

    return {
        headerLabels,
        tableData
    }

}



const express = require('express')
var cors = require('cors');
const { time, table } = require("console");
const app = express()
app.use(cors())
const port = 8888





app.get('/agentConversations', async (req, res) => {

    const selectedDate = req.query.day ||  "2021-12-16";
    const agentEmail =req.query.email || "vmaun@twilio.com"

    const agentDashboardQuery = await GDBackend.workspace(GDWorkspace).execution()
        .forItems([a("label.conversations.conversation_id"),a("date.date.yyyymmdd"), a("label.time.hour"),
        m("Average Hold Time"), m("Average Talk Time"), m("Average Wrap Up Time")],
            [
                newPositiveAttributeFilter(a("date.date.yyyymmdd"),[selectedDate]),
                newPositiveAttributeFilter(a("label.agents.email"), [agentEmail]),
            ])
        .withSorting(newAttributeSort(a("date.date.yyyymmdd"),"asc"),newAttributeSort(a("label.time.hour"),"asc"))
        .withDimensions(...newTwoDimensional([a("label.conversations.conversation_id"),a("date.date.yyyymmdd"), a("label.time.hour")], [

            MeasureGroupIdentifier]))
        .execute().catch(e => { return { statusCode: 500, e } });;

    if (agentDashboardQuery.e) {
        console.error(agentDashboardQuery.e);
        return;
    }

    const executeAllResponse = await agentDashboardQuery.readAll().catch(e => { return { statusCode: 500, e } });



    const tableData = extractTabularData(executeAllResponse);

    return res.json(tableData);



})


app.listen(port, () => {


    setupGoodDataSession();

    console.log(`Example app listening on port ${port}`)
})