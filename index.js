
$(function () {

    function showFile(fileInfo, fileContents) {
        var
            gpx,
            table,
            template;

        gpx = $.parseXML(fileContents);

        template = $('#track-point-template-row').detach();
        table = $('#track-point-table').detach();
        table.remove('tr:gt(0)'); // removes all previous generated TRs (but not the first one, which is the header!).

        $(gpx).find('trkpt').each(function (index) {
            var
                row,
                trkpt = this;

            row = template.clone();

            /*
                It's way faster to do getElementsByTagName/getAttribute instead of using jQuery's find/attr. It makes a
                lot of difference in the final loading time when you have to do it thousands of times.
             */
            row.find('td').each(function (index) {
                var
                    content = '?',
                    td = $(this);

                switch (index) {
                    case 0:
                        content = trkpt.getElementsByTagName('time')[0].textContent;
                        break;
                    case 1:
                        content = trkpt.getAttribute('lat');
                        break;
                    case 2:
                        content = trkpt.getAttribute('lon');
                        break;
                    case 3:
                        content = trkpt.getElementsByTagName('ele')[0].textContent;
                        break;
                }

                td.text(content)
            });

            row.appendTo(table).show();
        });

        table.prependTo('#track-point-panel');

        $('#file-name').text(fileInfo.name);

        $('#drop-target').hide();
        $('#gpx-view').show();
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

    prepareDropTarget();
});
