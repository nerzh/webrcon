
app.controller( 'ChatController', ChatController );

var CHAT_OUTPUT_LIMIT = 500;

function ChatController( $scope, rconService, $timeout )
{
	$scope.Output = [];
	var scrollTimeout = null;

	$scope.SubmitCommand = function ()
	{
		rconService.Command( "say " + $scope.Command, 1 );
		$scope.Command = "";
	}

	$scope.$on( "OnMessage", function ( event, msg )
	{
		if ( msg.Type !== "Chat" ) return;

		$scope.OnMessage( JSON.parse( msg.Message ) );
	});

	$scope.OnMessage = function( msg )
	{
		msg.Message = stripHtml(msg.Message);
		msg.Username = stripHtml(msg.Username);
		
		$scope.Output.push( msg );
		if($scope.Output.length > CHAT_OUTPUT_LIMIT) {
			$scope.Output.splice(0, $scope.Output.length - CHAT_OUTPUT_LIMIT);
		}
		
		if($scope.isOnBottom()) {
			$scope.ScrollToBottom();
		}
	}

	$scope.ScrollToBottom = function()
	{
		if(scrollTimeout !== null) {
			return;
		}

		scrollTimeout = $timeout( function() {
			scrollTimeout = null;
			var element = $( "#ChatController .Output" );
			element.scrollTop( element.prop('scrollHeight') );
		}, 50 );
	}

	$scope.isOnBottom = function()
	{
		// get jquery element
		var element = $( "#ChatController .Output" );

		// height of the element
		var height = element.height();

		// scroll position from top position
		var scrollTop = element.scrollTop();

		//  full height of the element
		var scrollHeight = element.prop('scrollHeight');

		if((scrollTop + height) > (scrollHeight - 10)) {
			return true;
		}

		return false;
	}

	//
	// Calls console.tail - which returns the last 256 entries from the console.
	// This is then added to the console
	//
	$scope.GetHistory = function ()
	{
		rconService.Request( "chat.tail 512", $scope, function ( msg )
		{
			var messages = JSON.parse( msg.Message );

			messages.forEach( function ( message ) {
			 $scope.OnMessage( message ); 
			});

			$scope.ScrollToBottom();
		} );
	}

	rconService.InstallService( $scope, $scope.GetHistory )

	$scope.$on( '$destroy', function () {
		if(scrollTimeout !== null) {
			$timeout.cancel(scrollTimeout);
			scrollTimeout = null;
		}
	} )
}

function stripHtml( text )
{
	return text ? String(text).replace( /<[^>]+>/gm, '' ) : '';
}
