
$(function () {

    function showFile(fileInfo, fileContents) {
        var
            gpx,
            table,
            locations = [],
            template;

        gpx = $.parseXML(fileContents);

        template = $('#track-point-template-row').detach();
        table = $('#track-point-table').detach();
        table.remove('tr:gt(0)'); // removes all previous generated TRs (but not the first one, which is the header!).

        $(gpx).find('trkpt').each(function (index) {
            var
                row,
                trkpt = this,
                /*
                 It's way faster to do getElementsByTagName/getAttribute instead of using jQuery's find/attr. It makes a
                 lot of difference in the final loading time when you have to do it thousands of times.
                 */
                location = {
                    timestamp: trkpt.getElementsByTagName('time')[0].textContent,
                    latLng: {
                        lat: parseFloat(trkpt.getAttribute('lat')),
                        lng: parseFloat(trkpt.getAttribute('lon'))
                    },
                    recordedElevation: trkpt.getElementsByTagName('ele')[0].textContent
                };

            row = template.clone();

            row.find('td').each(function (index) {
                var
                    content = '?',
                    td = $(this);

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

            locations.push(location);

            row.appendTo(table).show();
        });

        table.prependTo('#track-point-panel');

        $('#file-name').text(fileInfo.name);

        $('#drop-target').hide();
        $('#gpx-view').show();

        fetchGoogleMapsElevationData(locations);
    }

    function prepareDropTarget() {
        $('#drop-target')
            .on('dragover dragenter', function (e) {
                e.stopPropagation();
                e.preventDefault();
            })
            .on('drop', function (e) {
                var
                    self = $(this),
                    fileInfo,
                    reader;

                e.stopPropagation();
                e.preventDefault();

                e = e.originalEvent;

                fileInfo = e.dataTransfer.files[0];

                reader = new FileReader();
                reader.onload = function (re) {
                    showFile(fileInfo, re.target.result);
                };
                reader.readAsText(fileInfo);
            });
    }

    function displayGoogleMapsElevationResults(locations) {

        locations.forEach(function (location) {
            var
                result = location.googleMapsElevation;

            if (result) {
                location.element.find('td:eq(4)').text(result.elevation.toFixed(1));
                location.element.find('td:eq(5)').text(result.resolution.toFixed(1));
            }
        });
    }

    function fetchGoogleMapsElevationData(locations) {
        var
            PAGE_SIZE = 256,
            TIME_BETWEEN_REQUESTS = 1000,
            latLngs,
            locIndex,
            elevationService;

        elevationService = new google.maps.ElevationService();

        locIndex = 0;
        /*
            Google Maps API doesn't support a large number of locations at once; we have to paginate it.
         */
        async.whilst(
            function whilstTestCondition() {

                return locIndex < locations.length;
            },
            function whilstIter(nextWhilst) {

                latLngs = locations
                    .slice(locIndex, locIndex + PAGE_SIZE)
                    .map(function (location) { return location.latLng; });

                elevationService.getElevationForLocations({
                    locations: latLngs
                }, function (results, status) {

                    switch (status) {
                        case google.maps.ElevationStatus.OK:

                            results.forEach(function (result, index) {
                                locations[locIndex + index].googleMapsElevation = results[index];
                            });

                            displayGoogleMapsElevationResults(locations);

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
                    console.info('Loaded ' + Math.round(locIndex / PAGE_SIZE) + ' pages of a total of ' + Math.ceil(locations.length / PAGE_SIZE) + '.');
                } else {
                    console.info('All elevation information successfully fetched.')
                }
            }
        );
    }

    prepareDropTarget();
});
