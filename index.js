"use strict";


class Gpx {
    
    constructor () {
        this.locations = [];

        this.prepareDropTarget();

        $('#fetch-elevation-button').click(() => this.fetchGoogleMapsElevationData());
    }

    /**
     * Creates a drop zone for GPX files to be dragged over and loaded.
     */
    prepareDropTarget() {
        $('#drop-target')
            .on('dragover dragenter', (e) => {
                e.stopPropagation();
                e.preventDefault();
            })
            .on('drop', (e) => {
                e.stopPropagation();
                e.preventDefault();

                e = e.originalEvent;

                const fileInfo = e.dataTransfer.files[0];

                const reader = new FileReader();
                reader.onload = (re) => this.loadFile(fileInfo, re.target.result);
                reader.readAsText(fileInfo);
            });
    }

    /**
     * Fetch information about the elevation of each point in the `locations` array.
     *
     * It has to paginate fetches because Google imposes a limit on the number of locations per user per second, so it
     * may take a while before all data is fetched (it fetches a page per second, and every page brings about 256
     * location points; a regular file may have thousands of points).
     */
    fetchGoogleMapsElevationData() {
        const
            PAGE_SIZE = 256,
            TIME_BETWEEN_REQUESTS = 1100,
            self = this;

        const elevationService = new google.maps.ElevationService();

        let locIndex = 0;
        /*
         Google Maps API doesn't support a large number of locations at once; we have to paginate it.
         */
        async.whilst(
            function whilstTestCondition() {

                return locIndex < self.locations.length;
            },
            function whilstIter(nextWhilst) {

                const latLngs = self.locations
                    .slice(locIndex, locIndex + PAGE_SIZE)
                    .map(function (location) { return location.latLng; });

                elevationService.getElevationForLocations({
                    locations: latLngs
                }, function (results, status) {

                    switch (status) {
                        case google.maps.ElevationStatus.OK:

                            results.forEach(function (result, index) {
                                self.locations[locIndex + index].googleMapsElevation = results[index];
                            });

                            $('#maps-api-info').show().children('span')
                                .text('Done fetching ' + locIndex + ' of ' + self.locations.length + '.');

                            self.displayGoogleMapsElevationResults();

                            locIndex += PAGE_SIZE;

                            /*
                             Wait a little before sending the next page request. Google Maps API has a limit of 1
                             request per second per user.
                             */
                            window.setTimeout(nextWhilst, TIME_BETWEEN_REQUESTS);

                            break;
                        case google.maps.ElevationStatus.OVER_QUERY_LIMIT:
                            nextWhilst('Over query limit');
                            break;
                        case google.maps.ElevationStatus.INVALID_REQUEST:
                            nextWhilst('Invalid request');
                            break;
                        case google.maps.ElevationStatus.REQUEST_DENIED:
                            nextWhilst('Request denied');
                            break;
                        case google.maps.ElevationStatus.UNKOWN_ERROR:
                            nextWhilst('Unknown error');
                            break;
                        default:
                            nextWhilst('Unknown error code "' + status + '"');
                            break;
                    }
                });
            },
            function whilstDone(error) {

                if (error) {
                    console.error(error);
                    console.info('locIndex = ' + locIndex);
                    console.info('Loaded ' + Math.round(locIndex / PAGE_SIZE) + ' pages of a total of ' +
                        Math.ceil(self.locations.length / PAGE_SIZE) + '.');
                } else {
                    console.info('All elevation information successfully fetched.');
                    self.updateUIWithGoogleMapsData();
                }
            }
        );
    }

    computeClimbFromMapsAPI() {
        return this.computeElevationGain(location => location.googleMapsElevation.elevation);
    }

    computeClimbFromFileData() {
        return this.computeElevationGain(location => location.recordedElevation);
    }

    computeElevationGain(getElevation) {
        let acc = 0;

        if (this.locations.length > 1) {
            for (let i = 1; i < this.locations.length; i++) {
                const previousElevation = getElevation(this.locations[i - 1]);
                const currentElevation = getElevation(this.locations[i]);

                if (previousElevation < currentElevation) {
                    const diff = currentElevation - previousElevation;

                    if (diff > 10) {  // discard noise
                        console.info('up ' + diff.toFixed(2) + 'm, ' + acc.toFixed(0) + 'm so far.');
                    }
                    acc += diff;
                }
            }
        }

        return acc;
    }

    processTrackPoint(trackPoint, template, table) {
        let timestamp;

        /*
         GPX files exported from Strava rides other than your own won't bring you timestamp data. Strava does
         this on purpose so people don't obtain other person's timings without permission.

         Print some user-friendly message in case the user isn't aware of this problem.
         */
        try {
            timestamp = trackPoint.getElementsByTagName('time')[0].textContent;
        } catch (e) {
            if (e instanceof TypeError) {
                $('#error-view .message').html("<h1>The GPX file doesn't appear to have timestamp data.</h1>" +
                    "<p>Strava does not allow you to export other user's time data, so if that is the case, you " +
                    "may have to ask the author to export the GPX file for you.</p>" +
                    "<p><a href=\"javascript:location.reload()\">Reload app</a></p>");
                $('#error-view').removeClass('hidden');
            }
            throw e;
        }

        /*
         It's way faster to do getElementsByTagName/getAttribute instead of using jQuery's find/attr. It makes a
         lot of difference in the final loading time when you have to do it thousands of times.
         */
        const location = {
            timestamp: timestamp,
            latLng: {
                lat: parseFloat(trackPoint.getAttribute('lat')),
                lng: parseFloat(trackPoint.getAttribute('lon'))
            },
            recordedElevation: parseFloat(trackPoint.getElementsByTagName('ele')[0].textContent)
        };

        const row = template.clone();

        row.find('td').each(function (index) {
            const td = $(this);
            let content = '?';

            switch (index) {
                case 0:
                    content = location.timestamp;
                    break;
                case 1:
                    content = location.latLng.lat;
                    break;
                case 2:
                    content = location.latLng.lng;
                    break;
                case 3:
                    content = location.recordedElevation;
                    break;
            }

            td.text(content)
        });

        location.element = row;

        this.locations.push(location);

        row.appendTo(table).show();
    }

    loadFileLocations(fileContents) {
        const self = this;
        self.locations = [];

        console.time('XML parsing');
        const gpx = $.parseXML(fileContents);
        console.timeEnd('XML parsing');

        const template = $('#track-point-template-row').detach();
        const table = $('#track-point-table').detach();
        table.remove('tr:gt(0)'); // removes all previous generated TRs (but not the first one, which is the header!).

        console.time('Track points loading');
        $(gpx).find('trkpt').each(function () {
            const trackPoint = this;
            self.processTrackPoint(trackPoint, template, table);
        });
        console.timeEnd('Track points loading');

        table.appendTo('#track-point-panel');
    }

    loadFileStats(fileInfo) {
        $('#file-name').text(fileInfo.name);
        $('#original-climb').text(this.computeClimbFromFileData().toFixed(0) + ' m');
    }

    loadFileClimbChart() {

        const fileData = this.locations.map(function (location) {
            return {
                date: new Date(location.timestamp),
                value: location.recordedElevation
            }
        });

        const mapsData = this.locations.map(function (location) {
            const value = location.googleMapsElevation && location.googleMapsElevation.elevation ?
                location.googleMapsElevation.elevation :
                0;

            return {
                date: new Date(location.timestamp),
                value: value
            }
        });

        MG.data_graphic({
            //title: "Elevation",
            //description: "GPX file elevation data",
            data: [fileData, mapsData],
            width: 0.95 * $('.container').width(),
            height: 400,
            right: 40,
            target: '#climb-chart',
            legend: ['GPX', 'Maps']
        });
    }

    /**
     * Load GPX file.
     *
     * @param fileInfo
     * @param fileContents
     */
    loadFile(fileInfo, fileContents) {

        this.loadFileLocations(fileContents);
        this.loadFileStats(fileInfo);
        this.loadFileClimbChart();

        $('#drop-target').hide();
        $('#gpx-view').show();
    }

    /**
     * Updates the UI with the elevation results from Google Maps API.
     */
    displayGoogleMapsElevationResults() {

        this.locations.forEach(function (location) {
            const result = location.googleMapsElevation;

            if (result) {
                location.element.find('td:eq(4)').text(result.elevation.toFixed(1));
                location.element.find('td:eq(5)').text(result.resolution.toFixed(1));
            }
        });
    }

    updateUIWithGoogleMapsData() {
        $('#maps-api-info').hide();
        $('#maps-climb').text(this.computeClimbFromMapsAPI().toFixed(0) + ' m');
        this.loadFileClimbChart();
    }
}

window.addEventListener('load', () => new Gpx());
