app.controller('ServerInfoController', ServerInfoController);

var DATA_LIMIT = 60;
var SERVERINFO_REFRESH_INTERVAL = 1000;
var CHART_REFRESH_INTERVAL = 5000;

function ServerInfoController($scope, rconService, $routeParams, $interval) {
  $scope.useCharts = false;

  var recordedData = [];
  var lastChartUpdate = 0;
  var timer = null;
  var destroyed = false;

  // TODO: move serverinfo to service
  $scope.serverinfo = {};

  $scope.playersChart = {
    options: {
      chart: {
        type: 'pieChart',
        height: 250,
        margin: {
          top: 0,
          right: 75,
          bottom: 0,
          left: 75
        },
        donut: true,
        x: function(d) {
          return d.key;
        },
        y: function(d) {
          return d.y;
        },
        yAxis: {
          axisLabel: 'Slots',
          tickFormat: function(d) {
            return d3.format('.d')(d);
          }
        },
        showLabels: true,
        pie: {
          startAngle: function(d) {
            return d.startAngle / 2 - Math.PI / 2
          },
          endAngle: function(d) {
            return d.endAngle / 2 - Math.PI / 2
          }
        },
        duration: 0
      }
    },
    data: []
  };

  $scope.performanceChart = {
    options: {
      chart: {
        type: 'multiChart',
        height: 200,
        margin: {
          top: 30,
          right: 75,
          bottom: 40,
          left: 75
        },
        color: [
          'darkred', 'yellowgreen'
        ],
        duration: 0,
        lines1: {
          duration: 0
        },
        lines2: {
          duration: 0
        },
        useInteractiveGuideline: true,
        yAxis1: {
          axisLabel: 'Framerate',
          tickFormat: function(d) {
            return d3.format(',d')(d);
          }
        },
        yAxis2: {
          axisLabel: 'Entities',
          tickFormat: function(d) {
            return d3.format(',d')(d);
          },
          // axisLabelDistance: 12
        },
        xAxis: {
          axisLabel: "Time",
          tickFormat: function(d) {
            return d3.time.format('%H:%M:%S')(new Date(d))
          }
        }
      }
    },
    data: [
      {
        key: 'Framerate',
        type: "line",
        duration: 0,
        yAxis: 1,
        values: []
      }, {
        key: 'Entities',
        type: 'line',
        duration: 0,
        yAxis: 2,
        values: []
      }
    ]
  };

  $scope.netChart = {
    options: {
      chart: {
        type: 'stackedAreaChart',
        height: 250,
        margin: {
          top: 0,
          right: 75,
          bottom: 40,
          left: 75
        },
        useVoronoi: false,
        duration: 0,
        useInteractiveGuideline: true,
        yAxis: {
          axisLabel: 'Network',
          tickFormat: function(bytes) {
            var fmt = d3.format('.0f');
            if (bytes < 1024) {
              return fmt(bytes) + 'B';
            } else if (bytes < 1024 * 1024) {
              return fmt(bytes / 1024) + 'kB';
            } else if (bytes < 1024 * 1024 * 1024) {
              return fmt(bytes / 1024 / 1024) + 'MB';
            } else {
              return fmt(bytes / 1024 / 1024 / 1024) + 'GB';
            }
          }
        },
        xAxis: {
          axisLabel: "Time",
          tickFormat: function(d) {
            return d3.time.format('%H:%M:%S')(new Date(d))
          }
        }
      }
    },
    data: [
      {
        key: 'IN',
        values: []
      }, {
        key: 'OUT',
        values: []
      }
    ]
  };

  rconService.InstallService($scope, _startRefresh);

  $scope.ToggleCharts = function() {
    $scope.useCharts = !$scope.useCharts;

    if (!$scope.useCharts) {
      _resetChartData();
      return;
    }

    lastChartUpdate = 0;
    if ($scope.serverinfo && Object.keys($scope.serverinfo).length > 0) {
      _updateChartData($scope.serverinfo, Date.now());
    }
  }

  $scope.$on("OnDisconnected", function() {
    _stopRefresh();
    _resetChartData();
  });

  $scope.$on("$destroy", function() {
    destroyed = true;
    _stopRefresh();
    _resetChartData();
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
    $scope.serverinfo = {};
  });

  document.addEventListener('visibilitychange', _handleVisibilityChange);

  function _startRefresh() {
    if (destroyed || timer !== null || document.hidden)
      return;

    _refresh();
    timer = $interval(_refresh, SERVERINFO_REFRESH_INTERVAL);
  }

  function _stopRefresh() {
    if (timer === null)
      return;

    $interval.cancel(timer);
    timer = null;
  }

  function _refresh() {
    if (!rconService.IsConnected() || document.hidden)
      return;

    rconService.Request('serverinfo', $scope, function(msg) {
      _updateData(JSON.parse(msg.Message));
    });
  }

  function _updateData(data) {
    $scope.serverinfo = data;

    if ($scope.useCharts) {
      var now = Date.now();
      if (lastChartUpdate === 0 || now - lastChartUpdate >= CHART_REFRESH_INTERVAL) {
        _updateChartData(data, now);
      }
    }
  }

  function _updateChartData(data, timestamp) {
    lastChartUpdate = timestamp;
    _collectChartData(data, timestamp);
    _generateChartData();
  }

  function _collectChartData(data, timestamp) {
    // player chart
    $scope.playersChart.data = [
      {
        key: 'Queued',
        y: data.Queued
      }, {
        key: 'Joining',
        y: data.Joining
      }, {
        key: 'Players',
        y: data.Players
      }, {
        key: 'Free',
        y: (data.MaxPlayers - (data.Joining + data.Players))
      }
    ];

    recordedData.push({
      ts: timestamp,
      framerate: Number(data.Framerate) || 0,
      entityCount: Number(data.EntityCount) || 0,
      networkIn: Number(data.NetworkIn) || 0,
      networkOut: Number(data.NetworkOut) || 0
    });

    if (recordedData.length > DATA_LIMIT) {
      recordedData.splice(0, recordedData.length - DATA_LIMIT);
    }
  }

  function _generateChartData() {

    var fpsChartValues = [];
    var entChartValues = [];

    var netInChartValues = [];
    var netOutChartValues = [];

    for (var i = 0; i < recordedData.length; i++) {
      var record = recordedData[i];
      fpsChartValues.push({x: record.ts, y: record.framerate});
      entChartValues.push({x: record.ts, y: record.entityCount});

      netInChartValues.push({x: record.ts, y: record.networkIn});
      netOutChartValues.push({x: record.ts, y: record.networkOut});
    }

    $scope.performanceChart.data[0].values = fpsChartValues;
    $scope.performanceChart.data[1].values = entChartValues;

    $scope.netChart.data[0].values = netInChartValues;
    $scope.netChart.data[1].values = netOutChartValues;
  }

  function _resetChartData() {
    recordedData.length = 0;
    lastChartUpdate = 0;

    $scope.playersChart.data = [];
    $scope.performanceChart.data[0].values = [];
    $scope.performanceChart.data[1].values = [];
    $scope.netChart.data[0].values = [];
    $scope.netChart.data[1].values = [];
  }

  function _handleVisibilityChange() {
    if (document.hidden) {
      _stopRefresh();
      return;
    }

    if (rconService.IsConnected()) {
      _startRefresh();
    }
  }

}
