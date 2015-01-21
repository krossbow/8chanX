// ==UserScript==
// @name        Pashe's 8chanX v2 [pure]
// @version     2.0.0.1421804610
// @description Small userscript to improve 8chan
// @icon        https://github.com/Pashe/8chanX/raw/2-0/images/logo.svg
// @namespace   https://github.com/Pashe/8chanX/tree/2-0
// @updateURL   https://github.com/Pashe/8chanX/raw/2-0_pure/8chan-x.meta.js
// @downloadURL https://github.com/Pashe/8chanX/raw/2-0_pure/8chan-x.user.js

// @grant       none

// @require     https://8chan.co/js/jquery-ui.custom.min.js
// @require     https://github.com/alexei/sprintf.js/raw/master/src/sprintf.js
// @require     https://raw.githubusercontent.com/rmm5t/jquery-timeago/master/jquery.timeago.js
// @require     https://raw.githubusercontent.com/samsonjs/strftime/master/strftime.js

// @resource    normalFavicon https://github.com/Pashe/8chanX/raw/2-0/images/favicon.png

// @match       *://8chan.co/*
// @match       *://hatechan.co/*
// @match       *://jp.8chan.co/*
// @match       *://8ch.net/*
// @match       *://h.8chan.co/*
// @match       *://h.8ch.net/*
// ==/UserScript==

/*Contributors
** tux3
** Zaphkiel
** varemenos
** 7185
** Pashe
*/

////////////////
//GLOBAL VARIABLES
////////////////
//Constants
var bumpLimit = 300;

//Initializations
var cachedPages = null;
var galleryImages;
var galleryImageIndex;

//Dynamic
var isMod = (window.location.pathname.split("/")[1]=="mod.php");
var originalPageTitle = window.document.title;
var thisBoard = isMod?window.location.href.split("/")[4]:window.location.pathname.split("/")[1];
try {var thisThread = parseInt(window.location.href.match(/([0-9]+)\.html/)[1]);} catch (e) {var thisThread = -1};

////////////////
//SETTINGS
////////////////
var settingsMenu = window.document.createElement('div');

if (window.Options) {
	var tab = window.Options.add_tab('8chanX', 'times', '8chanX');
	$(settingsMenu).appendTo(tab.content);
}

settingsMenu.innerHTML = sprintf('<span style="font-size:8pt;">8chanX %s pure</span>', GM_info.script.version)
+ '<div style="overflow:auto;height:240px;">'
+ '<label><input type="checkbox" name="precisePages">' + 'Increase page indicator precision' + '</label><br>'
+ '<label><input type="checkbox" name="catalogLinks">' + 'Force catalog links' + '</label><br>'
+ '<label><input type="checkbox" name="revealImageSpoilers">' + 'Reveal image spoilers' + '</label><br>'
+ '<label><input type="checkbox" name="imageHover">' + 'Image hover' + '</label><br>'
+ '<label><input type="checkbox" name="catalogImageHover">' + 'Image hover on catalog' + '</label><br>'
+ '<label><input type="checkbox" name="reverseImageSearch">' + 'Add reverse image search links' + '</label><br>'
+ '<label><input type="checkbox" name="keyboardShortcutsEnabled">' + 'Enable keyboard shortcuts' + '</label><br>'
+ '<label><input type="checkbox" name="parseTimestampImage">' + 'Guess original download date of imageboard-style filenames' + '</label><br>'
+ '<span>Filter:</span><br>'
+ '  <label><input type="checkbox" name="filterTrips">' + 'Tripfags' + '</label><label><input type="checkbox" name="filterTripsRecursive">' + 'recursively' + '</label><br>'
+ '<label><input type="checkbox" name="localTime">' + 'Use local time' + '</label><br>'
+ '<label>' + '<a href="http://strftime.net/">Date format</a> (relative dates when empty):<br />' + '<input type="text" name="dateFormat" style="width: 1000pt"></label><br>'
+ '<label>' + 'Mascot URL(s) (pipe separated):<br />' + '<input type="text" name="mascotUrl" style="width: 1000pt"></label><br>'
+ '<button id="purgeDeadFavorites">' + 'Clean favorites' + '</button>'
+ '</div>';

var defaultSettings = {
	'precisePages': true,
	'catalogLinks': true,
	'revealImageSpoilers': false,
	'imageHover': true,
	'catalogImageHover': true,
	'reverseImageSearch': true,
	'parseTimestampImage': true,
	'localTime': true,
	'dateFormat':"",
	'mascotUrl':"",
	'keyboardShortcutsEnabled': true,
	'filterTrips': false,
	'filterTripsRecursive': true
};

function getSetting(key) {
	if (localStorage.getItem("chx_"+key)) {
		return JSON.parse(localStorage.getItem("chx_"+key));
	} else {
		return defaultSettings[key];
	}
}

function setting(key) {
	console.log(sprintf("setting('%s') is deprecated. Please report this.", key));
	return getSetting(key);
}

function setSetting(key, value) {
	localStorage.setItem("chx_"+key, JSON.stringify(value));
}

function refreshSettings() {
	var settingsItems = settingsMenu.getElementsByTagName("input");
	for (i in settingsItems) {
		var control = settingsItems[i];
		
		switch (control.type) {
			case "checkbox":
				control.checked = getSetting(control.name);
				break;
			default:
				control.value = getSetting(control.name);
				break;
		}
	}
}

function setupControl(control) {
	switch (control.type) {
		case "checkbox":
			$(control).on("change", function () {
				setSetting(this.name, this.checked);
			});
			break;
		default:
			$(control).on("input", function () {
				setSetting(this.name, this.value);
			});
			break;
	}
}

////////////////
//GENERAL FUNCTIONS
////////////////
function strEndsWith(str, s) {
	return str.length >= s.length && str.substr(str.length - s.length) == s;
}

function isOnCatalog() {
	return window.active_page === "catalog";
}

function isOnBoardIndex() {
	return window.active_page === "index";
}

function isOnThread() {
	return window.active_page === "thread";
}

function printf() { //alexei et al, 3BSD
	var key = arguments[0], cache = sprintf.cache
	if (!(cache[key] && cache.hasOwnProperty(key))) {
		cache[key] = sprintf.parse(key)
	}
	console.log(sprintf.format.call(null, cache[key], arguments))
}

function getThreadPage(threadId, boardId, cached) { //Pashe, WTFPL
	if ((!cached) || (cachedPages == null)) {
		$.ajax({
			url: "/" + boardId + "/threads.json",
			async: false,
			dataType: "json",
			success: function (response) {cachedPages = response;}
		});
	}
	
	return calcThreadPage(cachedPages, threadId);
}

function calcThreadPage(pages, threadId) { //Pashe, WTFPL
	threadPage = -1;
	var precisePages = getSetting("precisePages");
	
	for (var pageIdx in pages) {
		if (threadPage != -1) {break}
		var threads = pages[pageIdx]['threads'];
		
		for (threadIdx in threads) {
			if (threadPage != -1) {break}
			
			if (threads[threadIdx]['no'] == threadId) {
				if (!precisePages) {
					threadPage = pages[pageIdx]['page']+1;
				} else {
					threadPage = ((pages[pageIdx]['page']+1)+(threadIdx/threads.length)).toFixed(2)
				}
				break;
			}
		}
	}
	return threadPage;
}

function getThreadPosts(threadId, boardId, cached) { //Pashe, WTFPL
	return $(".post").length;
}

function getThreadImages(threadId, boardId, cached) { //Pashe, WTFPL
	return $(".post-image").length;
}

////////////////
//MENU BAR
////////////////
function updateMenuStats() { //Pashe, WTFPL
	var nPosts = getThreadPosts(thisThread, thisBoard, false);
	if (nPosts >= bumpLimit) {nPosts = sprintf('<span style="color:#f00;font-weight:bold;">%d</span>', nPosts);}
	
	$("#chx_menuPosts").html(nPosts);
	$("#chx_menuImages").html(getThreadImages(thisThread, thisBoard, false));
	
	$.ajax({
		url: "/" + thisBoard + "/threads.json",
		async: true,
		dataType: "json",
		success: function (response) {
			cachedPages = response;
			
			var nPage = calcThreadPage(response, thisThread);
			if (nPage < 1 ) {nPage = "<span style='opacity:0.5'>???</span>"}
			
			$("#chx_menuPage").html(nPage);
		}
	});
	
}

////////////////
//IMAGE HOVER
////////////////
var imghoverMMove = function(e) { //Tux et al, MIT //TODO: Cleanup
	if (!getSetting('imageHover') && !getSetting('catalogImageHover')) {return;}
	
	var pic;
	if ($(this)[0].tagName == "IMG") {pic = $(this);}
	else if ($(this)[0].tagName == "CANVAS") {pic = $(this).next();}
	
	var picUrl = pic.attr("src");
	if (picUrl.indexOf('spoiler.png') >= 0) {picUrl = $(this).parent().attr("href");}
	
	pic.parent().removeData("expanded");
	if (pic.parent().data("expanded")) {
		return;
	}
	
	picUrl = picUrl.replace("/src/","/thumb/");
	if (picUrl.indexOf('/thumb/') == -1) {
		return;
	}
	
	var picTimestamp = picUrl.substr(picUrl.indexOf("/thumb/")+7);
	var picTimestamp = picTimestamp.substr(0, picTimestamp.lastIndexOf("."));
	
	var picId = "post-image-"+picTimestamp;
	var hoverPic = $("#"+picId);
	
	var picRightEdge = hoverPic.width() + e.pageX;
	var windowWidth = $(window).width();
	
	if (!hoverPic.length) {
		var newpic = pic.clone();
		newpic.attr("id",picId);
		newpic.css('display', 'block').css('position', 'absolute').css('z-index', '200').css("margin", "0px").css("padding", "0px");
		newpic.attr("src",picUrl.replace("/thumb/","/src/"));
		
		if (picRightEdge > windowWidth) {
			newpic.css('left', (e.pageX + (windowWidth - picRightEdge))).css('top', top);
		} else {
			newpic.css('left', e.pageX).css('top', top);
		}
		
		newpic.css('width', 'auto').css('height', 'auto');
		newpic.css('pointer-events','none');
		newpic.css('max-height',$(window).height());
		newpic.css('max-width',$(window).width());
		newpic.insertAfter(pic);
	} else {
		var scrollTop = $(window).scrollTop();
		var epy = e.pageY;
		var top = epy;
		if (epy < scrollTop + 15) {
		  top = scrollTop;
		} else if (epy > scrollTop + $(window).height() - hoverPic.height() - 15) {
		  top = scrollTop + $(window).height() - hoverPic.height() - 15;
		}
		
		if (picRightEdge > windowWidth) {
			hoverPic.css('left', (e.pageX + (windowWidth - picRightEdge))).css('top', top);
		} else {
			hoverPic.css('left', e.pageX).css('top', top);
		}
	}
}

var imghoverMOut = function(e) { //Tux et al, MIT
	var pic;
	if ($(this)[0].tagName == "IMG") {pic = $(this);}
	else if ($(this)[0].tagName == "CANVAS") {pic = $(this).next();}
	
	var picUrl = pic.attr("src");
	if (picUrl.indexOf('spoiler.png') >= 0) {picUrl = $(this).parent().attr("href");}
	picUrl = picUrl.replace("/src/","/thumb/");
	
	var picTimestamp = picUrl.substr(picUrl.indexOf("/thumb/")+7);
	var picTimestamp = picTimestamp.substr(0, picTimestamp.lastIndexOf("."));
	var picId = "post-image-"+picTimestamp;
	
	var hoverPic = $("#"+picId);
	if (hoverPic.length) {hoverPic.remove();}
	
	if ($(this).hasClass('unanimated')) {
		$($(this).parent().children()).each( function (index, data) { //Oh Jesus what the fuck
			if ($(this).parent().data("expanded") != "true") {
				$(this).mousemove(imghoverMMove);
				$(this).mouseout(imghoverMOut);
				$(this).click(imghoverMOut);
			}
		});
	}
}

////////////////
//KEYBOARD SHORTCUTS
////////////////
function reloadPage() { //Pashe, WTFPL
	if (isOnThread()) {
		window.$('#update_thread').click();
	} else {
		document.location.reload();
	}
}

function showQR() { //Pashe, WTFPL
	window.$(window).trigger('cite');
	$("#quick-reply textarea").focus();
}

function toggleExpandAll() { //Tux et al, MIT
	var shrink = window.$('#shrink-all-images a');
	if (shrink.length) {
		shrink.click();
	} else {
		window.$('#expand-all-images a').click();
	}
}

function goToCatalog() { //Pashe, WTFPL
	if (isOnCatalog()) {return;}
	window.location = sprintf("/%s/catalog.html", thisBoard);
}

////////////////
//REVERSE IMAGE SEARCH
////////////////
var RISProviders = [
	{
		"urlFormat" : "https://www.google.com/searchbyimage?image_url=%s",
		"name"      : "Google"
	},
	{
		"urlFormat" : "http://iqdb.org/?url=%s",
		"name"      : "iqdb"
	},
	{
		"urlFormat" : "https://saucenao.com/search.php?db=999&url=%s",
		"name"      : "SauceNAO"
	},
	{
		"urlFormat" : "https://www.tineye.com/search/?url=%s",
		"name"      : "TinEye"
	}
];

function addRISLinks(image) { //Pashe, 7185, WTFPL
	for (var providerIdx in RISProviders) {
		var provider = RISProviders[providerIdx];
		
		try {
			if (!image.src.match(/\/spoiler.png$/)) {
				var RISUrl = sprintf(provider["urlFormat"], image.src);
			} else {
				var RISUrl = sprintf(provider["urlFormat"], image.parentNode.href);
			}
			
			var providerText = ("[" + provider["name"][0].toUpperCase() + "]");
			
			var RISLink = $('<a class="chx_RISLink"></a>');
			RISLink.attr("href", RISUrl);
			RISLink.attr("title", provider["name"]);
			RISLink.attr("target", "_blank");
			RISLink.css("font-size", "8pt");
			RISLink.css("margin-left", "2pt");
			RISLink.text("[" + provider["name"][0].toUpperCase() + "]");
			
			RISLink.appendTo(image.parentNode.parentNode.getElementsByClassName("fileinfo")[0]);
		} catch (e) {}
	}
}

////////////////
//NOTIFICATIONS
////////////////
function notifyReplies() {
	/*
	* taken from https://github.com/ctrlcctrlv/8chan/blob/master/js/show-own-posts.js
	*
	* Released under the MIT license
	* Copyright (c) 2014 Marcin Labanowski <marcin@6irc.net>
	*/
	
	var thread = $(this).parents('[id^="thread_"]').first();
	if (!thread.length) {thread = $(this);}
	
	var ownPosts = JSON.parse(window.localStorage.own_posts || '{}');
	
	$(this).find('div.body:first a:not([rel="nofollow"])').each(function() {
		var postID;
		
		if(postID = $(this).text().match(/^>>(\d+)$/)) {
			postID = postID[1];
		} else {
			return;
		}
		
		if (ownPosts[thisBoard] && ownPosts[thisBoard].indexOf(postID) !== -1) {
			var replyPost = $(this).closest("div.post");
			var replyUser = (replyPost.find(".name").text()+replyPost.find(".trip").text());
			var replyBody = replyPost.find(".body").text();
			var replyImage = replyPost.find(".post-image").first().attr('src');
			
			new Notification(replyUser+" replied to your post", {body:replyBody,icon:replyImage});
		}
	});
}

////////////////
//GALLERY
////////////////
var fileExtensionStyles = {
	"jpg":  {"background-color": "#0f0", "color": "#000"}, "jpeg": {"background-color": "#0f0", "color": "#000"},
	"png":  {"background-color": "#00f", "color": "#fff"},
	"webm": {"background-color": "#f00", "color": "#000"}, "mp4": {"background-color": "#a00", "color": "#000"},
	"gif": {"background-color": "#ff0", "color": "#000"},
};

function refreshGalleryImages() { //Pashe, WTFPL
	galleryImages = [];
	
	$(".post-image").each(function() {
		var $this = $(this);
		var metadata = $this.parent("a").siblings(".fileinfo").children(".unimportant").text().replace(/[()]/g, '').split(", ");
		if (!this.src.match(/\/deleted.png$/)) {
			galleryImages.push({
				"thumbnail":  this.src,
				"full":       this.parentNode.href,
				"fileSize":   metadata[0],
				"resolution": metadata[1],
				"aspect":     metadata[2],
				"origName":   metadata[3],
			})
		}
	})
}

function openGallery() { //Pashe, WTFPL
	refreshGalleryImages();
	
	var galleryHolder = $("<div id='chx_gallery'></div>");
	galleryHolder.appendTo($("body"));
	
	galleryHolder.css({
		"background-color": "rgba(0,0,0,0.8)",
		"overflow":         "auto",
		"z-index":          "101",
		"position":         "fixed",
		"left":             "0",
		"top":              "0",
		"width":            "100%",
		"height":           "100%"
	});
	
	galleryHolder.click(function(e) {
		if(e.target == this) $(this).remove();
	});
	
	for (i in galleryImages) {
		var image = galleryImages[i];
		var fileExtension = image["full"].match(/\.([a-z0-9]+)(&loop.*)?$/i)!=null?image["full"].match(/\.([a-z0-9]+)(&loop.*)?$/i)[1]:"???";
		
		var thumbHolder = $('<div class="chx_galleryThumbHolder"></div>');
		var thumbLink = $(sprintf('<a class="chx_galleryThumbLink" href="%s"></a>', image["full"]));
		var thumbImage = $(sprintf('<img class="chx_galleryThumbImage" src="%s" />', image["thumbnail"]));
		var metadataSpan = $(sprintf('<span class="chx_galleryThumbMetadata">%s</span>', fileExtension));
		
		thumbImage.css({
			"max-height": "128px",
			"max-width":  "128px",
			"margin":     "auto auto auto auto",
			"display":    "block"
		});
		
		thumbHolder.css({
			"padding":    "0pt 0pt 0pt 0pt",
			"height":     "155px",
			"width":      "128px",
			"overflow":   "hidden",
			"float":      "left",
			"text-align": "center",
			"color":      "#fff"
		});
		
		if (fileExtensionStyles.hasOwnProperty(fileExtension)) {
			metadataSpan.css(fileExtensionStyles[fileExtension]).css({"padding": "0pt 5pt 2pt 5pt", "border-radius": "2pt", "font-weight": "bolder"});
		}
		
		thumbImage.appendTo(thumbLink);
		thumbLink.appendTo(thumbHolder);
		metadataSpan.appendTo(thumbHolder);
		thumbHolder.appendTo(galleryHolder);
		
		thumbLink.click(i, function(e) {
			e.preventDefault();
			expandGalleryImage(parseInt(e.data));
		});
	}
}

function closeGallery() { //Pashe, WTFPL
	if ($("#chx_galleryExpandedImageHolder").length) {
		$("#chx_galleryExpandedImageHolder").remove();
	} else {
		$("#chx_gallery").remove();
	}
}

function toggleGallery() { //Pashe, WTFPL
	if ($("#chx_gallery").length) {
		closeGallery();
	} else {
		openGallery();
	}
}

function expandGalleryImage(index) { //Pashe, WTFPL
	galleryImageIndex = index;
	var image = galleryImages[index]["full"];
	var imageHolder = $('<div id="chx_galleryExpandedImageHolder"></div>');
	var fileExtension = image.match(/\.([a-z0-9]+)(&loop.*)?$/i)!=null?image.match(/\.([a-z0-9]+)(&loop.*)?$/i)[1]:"unknown";
	
	if ($.inArray(fileExtension, ["jpg", "jpeg", "gif", "png"]) != -1) {
		var expandedImage = $(sprintf('<img class="chx_galleryExpandedImage" src="%s" />', image));
		expandedImage.css({
			"max-height": "98%",
			"max-width":  "100%",
			"margin":     "auto auto auto auto",
			"display":    "block"
		});
	} else if ($.inArray(fileExtension, ["webm", "mp4"]) != -1) {
		image = image.match(/player\.php\?v=([^&]*[0-9]+\.[a-z0-9]+).*/i)[1];
		var expandedImage = $(sprintf('<video class="chx_galleryExpandedImage" src="%s" autoplay controls>Your browser is shit</video>', image));
		expandedImage.css({
			"max-height": "98%",
			"max-width":  "100%",
			"margin":     "auto auto auto auto",
			"display":    "block"
		});
	} else {
		var expandedImage = $(sprintf('<iframe class="chx_galleryExpandedImage" src="%s"></iframe>', image));
		expandedImage.css({
			"max-height": "98%",
			"max-width":  "100%",
			"height":     "98%",
			"width":      "100%",
			"margin":     "auto auto auto auto",
			"display":    "block"
		});
	}
	
	imageHolder.css({
		"background-color": "rgba(0,0,0,0.8)",
		"overflow":         "auto",
		"z-index":          "102",
		"position":         "fixed",
		"left":             "0",
		"top":              "0",
		"width":            "100%",
		"height":           "100%"
	});
	
	imageHolder.appendTo($("body"));
	expandedImage.appendTo(imageHolder);
	imageHolder.click(function(e) {
		if(e.target == this) $(this).remove();
	});
}

function jogExpandedGalleryImage(steps) {
	if ($("#chx_galleryExpandedImageHolder").length && galleryImages.hasOwnProperty(galleryImageIndex+steps)) {
		$("#chx_galleryExpandedImageHolder").remove();
		expandGalleryImage(galleryImageIndex+steps);
	}
}

////////////////
//FILTERS
////////////////
function tripFilter(post) { //Pashe, WTFPL
	if (post.trip && (post.trip != "!!tKlE5XtNKE")) { //You still have to tolerate me
		hidePost(post, getSetting("filterTripsRecursive"));
	}
}

function hidePost(post, recursive) { //Pashe, WTFPL
	post.jqObj.hide();
	post.jqObj.next("br").remove();
	
	if (recursive && post.ment.length) {
		for (var i in post.ment) {
			$("#reply_"+post.ment[i]).hide();
			$("#reply_"+post.ment[i]).next("br").remove();
		}
	}
}

////////////////
//INIT FUNCTIONS
////////////////
function initSettings() {
	refreshSettings();
	var settingsItems = settingsMenu.getElementsByTagName("input");
	for (var i = 0; i < settingsItems.length; i++) {
	  setupControl(settingsItems[i]);
	}
}

function initRelativeTime() {
	if (!getSetting("dateFormat")) {$("time").timeago();}
};

function initMenu() { //Pashe, WTFPL
	var menu = window.document.getElementsByClassName("boardlist")[0];
	var $menu = $(menu);
	
	$("[data-description='1'], [data-description='2']").hide();
	
	if (getSetting('catalogLinks') && !isOnCatalog()) {
		$('.favorite-boards a').each( function (index, data) {
			$(this).attr("href", $(this).attr("href")+"/catalog.html");
		});
	}
	
	if (isOnThread()) {
		$('#update_secs').remove();
		
		var updateNode = $("<span></span>");
		updateNode.attr("id", "update_secs");
		updateNode.css("font-family", "'Source Code Pro', monospace");
		updateNode.css("padding-left", "3pt");
		updateNode.attr("title","Update thread");
		updateNode.click(function() {$('#update_thread').click();});
		updateNode.appendTo($menu);
		
		var statsNode = $("<span></span>");
		statsNode.html(
			 '<span title="Posts" id="chx_menuPosts">---</span> / '
			+'<span title="Images" id="chx_menuImages">---</span> / '
			+'<span title="Page" id="chx_menuPage">---</span>'
		);
		statsNode.attr("id", "menuStats");
		statsNode.css("padding-left", "3pt");
		statsNode.appendTo($menu);
		
		updateMenuStats();
	}
}

function initImprovedPageTitles() {
	if (isOnThread()) {
		try {
			window.document.title = window.document.location.pathname.match(/\/(.*?)\//)[0] + " - " + (function(){
				var op = $(".op").text();
				var subject = op ? $(".subject").text() : null;
				var body = op ? $(".body").text() : null;
				return subject ? subject : body ? body.length > 128 ? body.substr(0, 128) + "..." : body : "8chan";
			})();
		} catch (e) {
			window.document.title = originalPageTitle;
		}
	}
}

function initRevealImageSpoilers() { //Tux et al, MIT
	if (!getSetting('revealImageSpoilers')) {return;}
	
	$('.post-image').each(function() {
		var pic;
		if ($(this)[0].tagName == "IMG") {pic = $(this);}
		else if ($(this)[0].tagName == "CANVAS") {pic = $(this).next();}
		
		var picUrl = pic.attr("src");
		if (picUrl.indexOf('spoiler.png') >= 0) {
			pic.attr("src", $(this).parent().attr("href"));
			pic.addClass("8chanx-spoilered-image");
		}
	});
}

function initImageHover() { //Tux et al, MIT //TODO: Cleanup
	if (!getSetting("imageHover") && !getSetting("catalogImageHover")) {return;}
	
	var selector = '';
	if (getSetting("imageHover")) selector += "img.post-image, canvas.post-image";
	
	if (getSetting('catalogImageHover') && isOnCatalog()) {
		if (selector != '') {selector += ', ';}
		selector += '.thread-image';
		$('.theme-catalog div.thread').each(function() {
			$(this).css('position','inherit');
		});
	}
	
	$(selector).each( function (index, data) {
		if ($(this).parent().data("expanded") != "true") {
			$(this).mousemove(imghoverMMove);
			$(this).mouseout(imghoverMOut);
			$(this).click(imghoverMOut);
		}
	});
}

function initKeyboardShortcuts() { //Pashe, heavily influenced by Tux et al, WTFPL
	if (!getSetting("keyboardShortcutsEnabled")) {return;}
	
	$(document).keydown(function(e) {
		if (e.keyCode == 27) {
			$('#quick-reply').remove();
			closeGallery();
		}
		
		if (e.target.nodeName == "INPUT" || e.target.nodeName == "TEXTAREA") {return;}
		if ((!e.ctrlKey) && (!e.metaKey)) {
			switch (e.keyCode) {
				case 82:
					reloadPage();
					break;
				case 81:
					showQR();
					e.preventDefault();
					break;
				case 71:
					toggleGallery();
					break;
				case 69:
					toggleExpandAll();
					break;
				case 67:
					goToCatalog();
					break;
				case 39:
					jogExpandedGalleryImage(+1);
					break;
				case 37:
					jogExpandedGalleryImage(-1);
					break;
			}
		}
	});
}

function initCatalog() { //Pashe, WTFPL
	if (!isOnCatalog()) {return;}
	
	//addCatalogPages
	$(".thread").each(function (e, ele) {
		var threadId = $(ele).html().match(/<a href="[^0-9]*([0-9]+).html?">/)[1];
		var threadPage = getThreadPage(threadId, thisBoard, true);
		
		$(ele).find("strong").first().append(" / P: " + (threadPage<1?"<span style='opacity:0.5'>???</span>":threadPage));
	});
	
	//highlightCatalogAutosage
	$(".replies").each(function (e, ele) {
		eReplies = $(ele).html().match(/R: ([0-9]+)/)[1];
		if (eReplies>bumpLimit) {
			$(ele).html(function(e, html) {
				return html.replace(/R: ([0-9]+)/, "<span style='color:#f00;'>R: $1</span>")
			});
		};
	});
	
	//setCatalogImageSize
	var catalogStorage = JSON.parse(localStorage["catalog"]);
	if (!catalogStorage["image_size"]) {
		catalogStorage["image_size"] = "large";
		localStorage["catalog"] = JSON.stringify(catalogStorage);
		
		$(".grid-li").removeClass("grid-size-vsmall");
		$(".grid-li").removeClass("grid-size-small");
		$(".grid-li").removeClass("grid-size-large");
		$(".grid-li").addClass("grid-size-" + catalogStorage["image_size"]);
		$("#image_size").val(catalogStorage["image_size"]);
	}
	
	//addCatalogNullImagePlaceholders
	$("img[src=''], img[src='/static/no-file.png']").attr("src", "data:image/svg+xml;base64,PHN2ZyB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgaGVpZ2h0PSIyMDAiIHdpZHRoPSIyMDAiIHZlcnNpb249IjEuMSI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwtODYwKSI+PHRleHQgc3R5bGU9ImxldHRlci1zcGFjaW5nOjBweDt0ZXh0LWFuY2hvcjptaWRkbGU7d29yZC1zcGFjaW5nOjBweDt0ZXh0LWFsaWduOmNlbnRlcjsiIHhtbDpzcGFjZT0icHJlc2VydmUiIGZvbnQtc2l6ZT0iNjRweCIgeT0iOTMwIiB4PSI5NSIgZm9udC1mYW1pbHk9IidBZG9iZSBDbGVhbiBVSScsIHNhbnMtc2VyaWYiIGxpbmUtaGVpZ2h0PSIxMjUlIiBmaWxsPSIjMDAwMDAwIj48dHNwYW4geD0iOTUiIHk9IjkyOSI+Tm88L3RzcGFuPjx0c3BhbiB4PSI5NSIgeT0iMTAxMCI+SW1hZ2U8L3RzcGFuPjwvdGV4dD48L2c+PC9zdmc+");
}

function initRISLinks() { //Pashe, 7185, WTFPL
	if (!getSetting("reverseImageSearch")) {return;}
	var posts = $("img.post-image").each(function() {addRISLinks(this);});
}

function initQrDrag() {
	$("#quick-reply").draggable();
}

function initParseTimestampImage() { //Pashe, WTFPL
	//if (!getSetting("parseTimestampImage")) {break;}
	try {
		var minTimestamp = new Date(1985,1).valueOf();
		var maxTimestamp = Date.now()+(24*60*60*1000);
		
		$("p.fileinfo > span.unimportant > a:link").each(function() {
			var $this = $(this);
			var filename = $this.text();
			
			if (!filename.match(/^([0-9]{9,13})[^a-zA-Z0-9]?.*$/)) {return;}
			var timestamp = parseInt(filename.match(/^([0-9]{9,13})[^a-zA-Z0-9]?.*$/)[1]);
			
			if (timestamp < minTimestamp) {timestamp *= 1000;}
			if ((timestamp < minTimestamp) || (timestamp > maxTimestamp)) {return;}
			
			var fileDate = new Date(timestamp);
			
			var fileTimeElement = $('<span class="chx_PTIStamp"></span>');
			fileTimeElement.attr("title", fileDate.toGMTString());
			fileTimeElement.attr("data-timestamp", timestamp);
			fileTimeElement.attr("data-isotime", fileDate.toISOString());
			fileTimeElement.text(", " + $.timeago(timestamp) + ")");
			fileTimeElement.appendTo($this.parent());
			
			$this.parent().html(function(e, html) {
				return html.replace(")", "")
			});
		});
	} catch (e) {}
}

function initNotifications() {
	Notification.requestPermission();
}

function initMascot() { //Pashe, based on an anonymous contribution, WTFPL
	if (!getSetting("mascotUrl")) {return;}
	
	var mascotUrls = getSetting("mascotUrl").split("|");
	var mascotUrl = mascotUrls[Math.floor((Math.random()*mascotUrls.length))];
	
	$("head").append(
		"<style>" +
		"	form[name=postcontrols] {"+
		"		margin-right: 22%;"+
		"	}"+
		"	div.delete{"+
		"		padding-right: 6%;"+
		"	}"+
		"	div.styles {"+
		"		float: left;"+
		"	}"+
		"	div#chx_mascot img {"+
		"		display: block;"+
		"		position: fixed;"+
		"		bottom: 0pt;"+
		"		right: 0pt;"+
		"		left: auto;"+
		"		max-width: 25%;"+
		"		max-height: 100%;"+
		"		opacity: 0.8;"+
		"		z-index: -100;"+
		"		pointer-events: none;"+
		"	}"+
		"</style>"
	);
	
	var mascotHolder = $('<div id="chx_mascot"></div>');
	var mascotImage = $('<img></img>');
	var hostElement = $("body").first();
	
	mascotImage.attr("src", mascotUrl);
	
	mascotImage.appendTo(mascotHolder);
	mascotHolder.appendTo(hostElement);
	
	if (isOnCatalog()) {mascotImage.css("z-index", "-100");}
}

function initpurgeDeadFavorites() { //Pashe, WTFPL
	$("#purgeDeadFavorites").click(function() {
		console.log("Working...");
		var originalText = $("#purgeDeadFavorites").text();
		$("#purgeDeadFavorites").text("Working...");
		$("#purgeDeadFavorites").prop("disabled", true);
		var boards;
		$.ajax({
				url: "/boards.json",
				async: false,
				dataType: "json",
				success: function (response) {boards = response;}
		});	
		var boardsURIs = [];
		var favorites = JSON.parse(localStorage.favorites);

		for (var x in boards) {
			boardsURIs.push(boards[x]['uri']);
		}
		
		if (boardsURIs.length > 0) {
			for (var i=0; i<favorites.length; i++) {
				var board = favorites[i];
				if (($.inArray(board, boardsURIs) == -1)) {
					$.ajax({
						url: "/" + board + "/",
						async: false,
						statusCode: {404: function() {
							unfavorite(board);
							console.log("Purge board /" + board + "/");
						}},
						success: function () {console.log("Keep unlisted board /" + board + "/");},
						type: "HEAD"
					});
				} else {
					console.log("Keep listed board /" + board + "/");
				}
			}
		}
		console.log("Done");
		$("#purgeDeadFavorites").text(originalText + " - done")
		$("#purgeDeadFavorites").prop("disabled", false);
	});
}

function initDefaultSettings() { //Pashe, WTFPL
	if (window.localStorage.color_ids == undefined) window.localStorage.color_ids = true;
	if ((window.localStorage.videohover == undefined) && getSetting('imageHover')) window.localStorage.videohover = true;
	if (window.localStorage.useInlining == undefined) window.localStorage.useInlining = true;
}

function initFavicon() { //Pashe, WTFPL
	var faviconUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAFo9M/3AAAAAXNSR0IArs4c6QAAAeNJREFUOMu9kk1IVGEUhp/3jj8zukiYIGkh6iftwzZGaw1EqJW5KAxsvhmFgta1DGpRGTF35g5EURBGQRuJqG21iCKIaOUVCqHdYIU/k849LXIMEymCenbncM7hvO85sIF6fTgv6GELfb44qc0gFz6wwN4D4Hxo7MRmi/PhQ+BIU1++NKSkvpjALoAmM3tsCp7H0eShHec4Xzzs8uEFAPXnouZF1b8BYHyIK4UekDW2aVpU/Q3YsTiautc9Wezcm6tkMkHpOEmyP45+6vh7UttTJpfrPJ89MLJWfT27sK3A5fc8NXgFdifbP/xFzoezwPAPnzQWlwszAPty0e666h/lfGiNbZ0vvgANSDphZlfMdDlojO4ev5nGgpla22pbYjZo0sn5SuGinC9Ng50BMEt1zFf8Z/4rv7W6e/xqR6q15RFoYIuZcG0uKpxVI+714VEZgya1S3pWy6zcTpbalSGZWCe439xaq85dP10D6PXFMaG7wLvA+fCc86VEUlnirbBZzEZal9PLGdWXCGy0hbWuRjNAEGhp47vScj5cAdK19Zbswo2J6raz58ujmF0Cun5RfyuuZifkfJgDIuArsmlLgk8SQ8jaMavG0dToH5noThUPktIwiVYV8HKunH/SePx/ynf5T8EXjP2zGwAAAABJRU5ErkJggg==";
	$('<link></link>').attr("rel", "shortcut icon").attr("href", faviconUrl).appendTo($("head").first());
}

function initFlagIcons() { //Anon from >>>/tech/60489, presumably WTFPL or similar
	if (!$("#user_flag").length) {return;}
	
	var board = window.location.pathname.replace(/^\/([^/]+).*?$/, "$1");
	var custom_flag_url = window.location.origin + '/static/custom-flags/' + board + '/';
	var dropdown_options = document.getElementById('user_flag').childNodes;

	if (!dropdown_options || !dropdown_options.length) return;

	for (var i = 0; i < dropdown_options.length; i++) {
			var opt = dropdown_options[i];
			opt.style.paddingLeft = '20px';
			if (opt.value)
					opt.style.background = 'no-repeat left center url(' + custom_flag_url + opt.value + '.png)';
	}
}

function initFormattedTime() { //Pashe, WTFPL
	if (!getSetting("dateFormat")) {return;}
	
	$("time").text(function() {
		//%Y-%m-%d %H:%M:%S is nice
		
		var $this = $(this);
		
		var thisDate = new Date($this.attr("datetime"));
		
		if (getSetting("localTime")) {
			return strftime(getSetting("dateFormat"), thisDate);
		} else {
			return strftimeUTC(getSetting("dateFormat"), thisDate);
		}
	});
}

function initFilter() { //Pashe, WTFPL
	if (isMod) {return;}
	var filterTrips = (getSetting("filterTrips"));
	
	$(".post").each(function() {
		var $this = $(this);
		
		var thisPost = {
			//name:  $this.find("span.name").text(),
			trip:  $this.find("span.trip").text(),
			// cap:   $this.find("span.capcode").text(),
			// email: $this.find("a.email").attr("href"),
			// flag:  $this.find("img.flag").attr("title"),
			// date:  $this.find("time").attr("datetime"),
			// no:    $this.find("a.post_no").first().next().text(),
			ment:  $this.find(".mentioned").text().length?$this.find(".mentioned").text().replace(/>>/g, "").replace(/ $/, "").split(" "):[],
			// sub:   $this.find("span.subject").text(),
			// body:  $this.find("div.body").text(),
			jqObj: $this,
			//stdObj: this,
		};
		
		if (thisPost.trip == "!!tKlE5XtNKE") {$this.find("span.trip").after($(' <span class="capcode" title="Green is my pepper; I shall not want."><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAFo9M/3AAADgUlEQVQ4y2VTbUyTVxS+VZaYqMtcHFHjZCEbsgwR2jS0EKCLSJnMSoGy0toKFUvpB/TjpX37SfuuDChSJlTHqiIBqTJF14JMous0hERj5uIPib+XLCbLsvhj/tig58y+Vea28+e55z7POffce88hhnYBWTf9aTGyi/H5oxxidYqhN65AgohkONmJsR/7UqFkK5KW3Pc2uFtK0KYqxsC1I5mY3mjbdBpP3dUQYjhfe6adKk11aAtWgzfV24lJJ3xumZCCbkwEgcQxHpFtyv6IYg6AdVAE5HUzqHkl3pnmv05FtD+Pzh79I733xW1JhjSPHP6zc1wF1C0tMBc9EFp2QexhFMOLlsPEINmfpSvNp3y28rVuXyXQ9jIwh8uh53oT9sw07yU7Xh5hE7wPDlkxnsjd8VjJ24WOuEr8EAczpKm3hvMCOFNL4UnyX6Of2Uh9ffHbodGGkZNJGp2t+c+iTxh/mpt9/Cgj8sw1o93fAENJLQwndCmbpwC/XLYlWPKEQyjqnlJj17VWmHg0A4pRIXy78h2MLbkz76iXFJY7nFXY0V8NrqsKVIcE4LksTTEJxdP1OixqPrroCvCOfAomqgjs56tTzJx6ZV1gqih4QnWVgd1XgZ3qfeiI1a72XpGOZcj8PNKwdYvWJd6HXjn3qSp7G2q6uL//77rGOdW/fN+5puGRW67fZqeCtQOSd7iJCzL+Ky50r4NFZkFKiC5yaGPaUQTLiuwx+dLns/pfKXc9aiyl2H/HjOM/MOgIiZEO1+BQRIIDicZz3tvynWwj3VRuYDMdc1bm0DH5T3RcifbpxjXn9Gfgnm8B5no70KMycE3UgW9CBgM3jqeiD4IYvR/C/sX2g+vltqkLj3R6qpA+24q2sxowTirAGtfAV/fPoOeSBRv7+GD6RgbhpBci35vx5KIG+260/ZPARHZuNTZz5x1GITr1glWbpwKsQ2LwTcrByohAz/DBEhGB40JNynu1HgNx5YrvinovG9xRnJeVxuN7cg6Z67jPe4xlSOsESL1oSzoggm6LEIw0H6ivP0HntGTNn2jC4IJy2X+pbhebQLrlLc7LQt7Q5O2565QWodMgBLr/ILjdlUh9/CF28XKQsvKw+3I1Oi7W/BIYrCpMB/gna9kPIK+NN5G+udkr274NdB+8i/b9uRYeIbtFWVmnSzkbF0o2bT7wSsfNzmPxb3jllxw700zlAAAAAElFTkSuQmCC" style="width:16px;height:16px;" /> 8chanX</span>'));}
		
		if (getSetting("filterTrips")) {tripFilter(thisPost);}
	});
}

////////////////
//INIT CALLS
////////////////
initSettings();

$(window.document).ready(function() {
	initRelativeTime();
	initMenu();
	initRevealImageSpoilers();
	initImageHover();
	initKeyboardShortcuts();
	initCatalog();
	initRISLinks();
	initParseTimestampImage();
	initNotifications();
	initMascot();
	initpurgeDeadFavorites();
	initDefaultSettings();
	initFavicon();
	initFlagIcons();
	initFormattedTime();
	initFilter();
});

////////////////
//EVENT HANDLER FUNCTIONS
////////////////
function onNewPostRelativeTime() {
	if (!getSetting("dateFormat")) {$("time").timeago();}
}

function onNewPostImageHover(post) { //Tux et al, MIT
	if (!getSetting("imageHover")) {return;}
	$("#"+$(post).attr("id")+" .post-image").each( function (index, data) {
		if ($(this).parent().data("expanded") != "true") {
			$(this).mousemove(imghoverMMove);
			$(this).mouseout(imghoverMOut);
			$(this).click(imghoverMOut);
		}
	});
}

function onNewPostRISLinks(post) { //Pashe, 7185, WTFPL
	$("#"+$(post).attr("id")+" img.post-image").each(function() {addRISLinks(this);}); 
}

function onNewPostNotifications(post) {
	var $post = $(post);
	if ($post.is('div.post.reply')) {
		$post.each(notifyReplies);
	} else {
		$post.find('div.post.reply').each(notifyReplies);
	}
}

function onNewPostMenu() {
	updateMenuStats();
}

function onNewPostFormattedTime() {
	initFormattedTime();
}

function onNewPostFilter(post) { //Pashe, WTFPL
	if (!getSetting("filterTrips")) {return;}
	
	$(post).each(tripFilter);
}

function intervalMenu() {
	updateMenuStats();
}

////////////////
//EVENT HANDLERS
////////////////
window.$(document).on('new_post', function (e, post) {
	onNewPostRelativeTime();
	onNewPostImageHover(post);
	onNewPostRISLinks(post);
	onNewPostNotifications(post);
	onNewPostFormattedTime();
});

if (isOnThread()) {
	setInterval(intervalMenu, (1.5*60*1000));
}