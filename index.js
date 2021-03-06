"use strict";


class Gpx {
    
    constructor () {
        this.locations = [];

        this.dropTargetView = document.getElementById('drop-target');
        this.sampleButton = document.getElementById('sample-button');
        this.loadingProgressBar = document.getElementById('loading-progress-bar');
        this.elevationGainInMetersFileField = document.getElementById('elevation-gain-meters-file');
        this.fileNameField = document.getElementById('file-name');
        this.loadingScreen = document.getElementById('loading-screen');
        this.errorView = document.getElementById('error-view');
        this.errorViewTextField = this.errorView.querySelector('.message');
        this.gpxView = document.getElementById('gpx-view');
        this.templateRow = document.querySelector('.track-point-template-container').querySelector('tr');

        this.prepareDropTarget();

        this.sampleButton.addEventListener('click', () => this.loadSampleGpx());
    }

    /**
     * Creates a drop zone for GPX files to be dragged over and loaded.
     */
    prepareDropTarget() {
        this.dropTargetView.addEventListener('dragover', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
        this.dropTargetView.addEventListener('dragenter', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
        this.dropTargetView.addEventListener('drop', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const fileInfo = e.dataTransfer.files[0];

            const reader = new FileReader();
            reader.onload = (re) => this.loadFile(fileInfo.name, re.target.result);
            reader.readAsText(fileInfo);
        });
    }

    loadSampleGpx() {
        const fileName = 'canoas.gpx';
        const client = new XMLHttpRequest();
        client.open('GET', fileName);
        client.addEventListener('readystatechange', () => {
            if (client.readyState === XMLHttpRequest.DONE) {
                this.loadFile(fileName, client.responseText);
            }
        });
        client.send();
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

                if (previousElevation < currentElevation) {  // only consider elevation _gain_
                    const diff = currentElevation - previousElevation;

                    if (diff > Gpx.NOISE_THRESHOLD_IN_METERS) {  // most likely noise
                        console.info('Discarded noise: ' + diff.toFixed(2) + 'm');
                    }
                    acc += diff;
                }
            }
        }

        return acc;
    }

    showErrorMessage(title, message) {
        this.errorViewTextField.innerHTML = `<h1>${title}</h1><p>${message}</p>` +
            "<p><a href=\"javascript:location.reload()\">Reload app</a></p>";
        this.errorView.classList.remove('hidden');
    }

    processTrackPoint(trackPoint, tableBody) {
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
                this.showErrorMessage("This GPX file doesn't appear to contain timestamp data",
                    "Strava does not allow you to export other user's time data, so if that is the case, you may " +
                    "want to ask them to export the GPX file for you.");
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

        const row = this.templateRow.cloneNode(true);

        row.querySelector('.column-timestamp').innerText = location.timestamp;
        row.querySelector('.column-lat').innerText = location.latLng.lat;
        row.querySelector('.column-lng').innerText = location.latLng.lng;
        row.querySelector('.column-recorded-elevation').innerText = location.recordedElevation;

        location.element = row;

        this.locations.push(location);

        tableBody.appendChild(row);
    }

    /**
     * Parses GPX file into an array of location points.
     *
     * @param {string} fileContents
     */
    async loadFileLocations(fileContents) {
        const self = this;
        self.locations = [];

        let gpx;
        try {
            console.time('XML parsing');
            gpx = (new DOMParser()).parseFromString(fileContents, 'application/xml');
            console.timeEnd('XML parsing');
        } catch (e) {
            this.showErrorMessage('Invalid GPX file', 'The file could not be parsed because it does not contain ' +
                'valid XML.');
            throw e;
        }

        const table = document.querySelector('#track-point-table');
        // temporarily remove table from DOM to speed up TR appending process
        table.parentNode.removeChild(table);

        console.time('Track points loading');
        const trackPoints = gpx.querySelectorAll('trkpt');

        const tickPeriod = 100;
        let nextTickAt = tickPeriod;
        for (let i = 0; i < trackPoints.length; i++) {
            const trackPoint = trackPoints[i];
            self.processTrackPoint(trackPoint, table.querySelector('tbody'));

            if (i === nextTickAt) {
                this.loadingProgressBar.style.width = Math.round(100 * (i / trackPoints.length)) + '%';
                await this.nextTick();  // force progress bar update to be rendered
                nextTickAt += tickPeriod;
            }
        }
        console.timeEnd('Track points loading');

        // reinsert table in DOM
        console.time('Table appending to DOM');
        document.querySelector('#track-point-panel').appendChild(table);
        console.timeEnd('Table appending to DOM');
    }

    loadFileClimbChart() {

        const fileData = this.locations.map(location => { return {
                date: new Date(location.timestamp),
                value: location.recordedElevation
        }});

        const width = parseInt(getComputedStyle(this.gpxView).width, 10);

        MG.data_graphic({
            data: [fileData],
            width: 0.95 * width,
            height: 400,
            right: 40,
            target: '#climb-chart',
            legend: ['GPX', 'Maps']
        });
    }

    /**
     * Load GPX file.
     *
     * @param {string} fileName
     * @param {string} fileContents
     * @return {void}
     */
    async loadFile(fileName, fileContents) {
        this.dropTargetView.classList.add('hidden');
        this.loadingScreen.classList.remove('hidden');

        this.loadingProgressBar.style.width = '0%';
        await this.nextTick();  // skip this tick so the loading screen has the chance to appear

        await this.loadFileLocations(fileContents);

        await this.nextTick();  // skip this tick so the loading screen has the chance to appear
        this.loadingProgressBar.style.width = '100%';

        this.fileNameField.innerText = fileName;
        this.elevationGainInMetersFileField.innerText = this.computeClimbFromFileData().toFixed(0) + ' m';

        console.time('Elevation gain chart loading');
        this.loadFileClimbChart();
        console.timeEnd('Elevation gain chart loading');

        this.loadingScreen.classList.add('hidden');
        this.gpxView.classList.remove('hidden');
    }

    /**
     * Forces everything that goes after a call to `nextTick()` to, guess what, happen in the next tick :-)
     * @return {Promise}
     */
    nextTick() {
        return new Promise((resolve) => setTimeout(resolve, 10));
    }
}

/** time to wait between Google Maps requests in order to respect throttling policy */
Gpx.TIME_BETWEEN_MAPS_API_REQUESTS = 1500;
/** how many elevation points to request per call */
Gpx.MAPS_API_PAGE_SIZE = 256;
/** minimum difference in elevation to decide discarding it as noise */
Gpx.NOISE_THRESHOLD_IN_METERS = 10;

window.addEventListener('load', () => new Gpx());
