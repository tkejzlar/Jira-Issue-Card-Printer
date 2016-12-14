(function() {

  var global = {};
  global.version = "R_4.4.2";
  global.issueTrackingUrl = "https://github.com/tkejzlar/Jira-Issue-Card-Printer";

  global.isDev = document.currentScript == null;

  // enforce jQuery
  if (typeof jQuery == 'undefined') {
    alert("jQuery is required!\n\nPlease create an issue at " + global.issueTrackingUrl);
    return;
  }
  var $ = jQuery;

  // run
  try {
    init().then(main).catch(handleError);
  } catch (e) {
    handleError(e);
  }

  function main() {
    var promises = [];

    ga('send', 'pageview');

    //preconditions
    if ($("#card-printer-iframe").length > 0) {
      alert("Card Printer already opened!");
      return;
    }

    console.log("Run...");
    // determine application
    if ($("meta[name='application-name'][ content='JIRA']").length > 0) {
      console.log("App: " + "Jira");
      global.appFunctions = jiraFunctions;
    } else if (/.*pivotaltracker.com\/.*/g.test(document.URL)) {
      console.log("App: " + "PivotalTracker");
      global.appFunctions = pivotalTrackerFunctions;
    } else if (/.*trello.com\/.*/g.test(document.URL)) {
      console.log("App: " + "Trello");
      global.appFunctions = trelloFunctions;
    } else if (/.*myjetbrains.com\/youtrack\/.*/g.test(document.URL) || /.*youtrack.jetbrains.com\/.*/g.test(document.URL) ) {
      console.log("App: " + "YouTrack");
      global.appFunctions = youTrackFunctions;
    } else {
      alert("Unsupported app. Please create an issue at " + global.issueTrackingUrl);
      return;
    }



    // add overlay frame
    var appFrame = createOverlayFrame();
    $("body").append(appFrame);
    // add convinient fields
    appFrame.window = appFrame.contentWindow;
    appFrame.document = appFrame.window.document;
    global.appFrame = appFrame;

    // add print dialog content
    $("head", global.appFrame.document).prepend(printPreviewElementStyle());
    $("body", global.appFrame.document).append(printPreviewElement());
    updatePrintDialoge();

    // get print content frame
    var printFrame = $("#card-print-dialog-content-iframe", global.appFrame.document)[0];
    // add convinient fields
    printFrame.window = printFrame.contentWindow;
    printFrame.document = printFrame.window.document;
    global.printFrame = printFrame;

    // add listeners to redraw crads on print event
    printFrame.window.addEventListener("resize", redrawCards);
    printFrame.window.matchMedia("print").addListener(redrawCards);

    // collect selcted issues
    var issueKeyList = global.appFunctions.getSelectedIssueKeyList();
    if (issueKeyList.length <= 0) {
      alert("Please select at least one issue.");
      return;
    } else if (issueKeyList.length > 30) {
      var confirmResult = confirm("Are you sure you want select " + issueKeyList.length + " issues?");
      if (!confirmResult) {
        return;
      }
    }

    // render cards
    promises.push(renderCards(issueKeyList));

    $("#card-print-dialog-title", global.appFrame.document).text("Card Printer " + global.version + " - Loading issues...");
    return Promise.all(promises).then(function() {
      $("#card-print-dialog-title", global.appFrame.document).text("Card Printer " + global.version);
    });
  }

  function init() {
    var promises = [];
    console.log("Init...0");

    addStringFunctions();
    console.log("Init... " + global.version);

    loadSettings();
    console.log("Init...2");

    global.hostOrigin = "https://tkejzlar.github.io/Jira-Issue-Card-Printer/";
    if (global.isDev) {
      console.log("DEVELOPMENT");
      global.hostOrigin = "https://rawgit.com/tkejzlar/Jira-Issue-Card-Printer/develop/";
    }
    global.resourceOrigin = global.hostOrigin + "resources/";
        console.log("Init...3");

    promises.push(httpGetCORS(global.hostOrigin + "card.html").then(function(data){
      global.cardHtml = data;
    }));
    console.log("Init...4");
    promises.push(httpGetCORS(global.hostOrigin + "card.css").then(function(data){
      global.cardCss = data.replace(/https:\/\/tkejzlar.github.io\/Jira-Issue-Card-Printer\/resources/g, global.resourceOrigin);
    }));
    console.log("Init...5");
    promises.push(httpGetCORS(global.hostOrigin + "printPreview.html").then(function(data){
      global.printPreviewHtml = data
    }));
    console.log("Init...6");
    promises.push(httpGetCORS(global.hostOrigin + "printPreview.css").then(function(data){
      global.printPreviewCss = data.replace(/https:\/\/tkejzlar.github.io\/Jira-Issue-Card-Printer\/resources/g, global.resourceOrigin);
    }));
    console.log("Init...7");
    return Promise.all(promises);
    console.log("Init... Done");
  }

  function handleError(error){
    console.log("ERROR " + error.stack);
    ga('send', 'exception', { 'exDescription': error.message,'exFatal': true });
    alert("Sorry something went wrong.\n\n" + error.message +"\n\nPlease create an issue at " + global.issueTrackingUrl + "\n\n" + error.stack);
  }

  function saveSettings(){
    var settings = global.settings;
    writeCookie("card_printer_scale", settings.scale);
    writeCookie("card_printer_row_count", settings.rowCount);
    writeCookie("card_printer_column_count", settings.colCount);

    writeCookie("card_printer_single_card_page", settings.singleCardPage);
    writeCookie("card_printer_hide_description", settings.hideDescription);
    writeCookie("card_printer_hide_assignee", settings.hideAssignee);
    writeCookie("card_printer_hide_due_date", settings.hideDueDate);
    writeCookie("card_printer_hide_qr_code", settings.hideQrCode);
  }

  function loadSettings(){
    var settings = global.settings = global.settings || {};
    settings.scale = parseFloat(readCookie("card_printer_scale")) || 0.0;
    settings.rowCount = parseInt(readCookie("card_printer_row_count")) || 2;
    settings.colCount = parseInt(readCookie("card_printer_column_count")) || 1;

    settings.singleCardPage = parseBool(readCookie("card_printer_single_card_page"), true );
    settings.hideDescription = parseBool(readCookie("card_printer_hide_description"), false);
    settings.hideAssignee = parseBool(readCookie("card_printer_hide_assignee"), false);
    settings.hideDueDate = parseBool(readCookie("card_printer_hide_due_date"), false);
    settings.hideQrCode = parseBool(readCookie("card_printer_hide_qr_code"), false);
  }

  function print() {
    ga('send', 'event', 'button', 'click', 'print', $(".card", global.printFrame.contentWindow.document).length);
    global.printFrame.contentWindow.print();
  }

  function createOverlayFrame(){
    var appFrame = document.createElement('iframe');
    appFrame.id = "card-printer-iframe";
    $(appFrame).css({
      'position': 'fixed',
      'height': '100%',
      'width': '100%',
      'top': '0',
      'left': '0',
      'background': 'rgba(0, 0, 0, 0.0)',
      'boxSizing': 'border-box',
      'wordWrap': 'break-word',
      'zIndex': '99999'
    });
    return appFrame;
  }

  function updatePrintDialoge(){
    var appFrameDocument = global.appFrame.document;
    var settings = global.settings;
    $("#scaleRange", appFrameDocument).val(settings.scale);
    $("#scaleRange", appFrameDocument).parent().find("output").val(settings.scale);
    $("#rowCount", appFrameDocument).val(settings.rowCount);
    $("#columnCount", appFrameDocument).val(settings.colCount);

    $("#single-card-page-checkbox", appFrameDocument).attr('checked', settings.singleCardPage );
    $("#description-checkbox", appFrameDocument).attr('checked', !settings.hideDescription );
    $("#assignee-checkbox", appFrameDocument).attr('checked', !settings.hideAssignee );
    $("#due-date-checkbox", appFrameDocument).attr('checked', !settings.hideDueDate );
    $("#qr-code-checkbox", appFrameDocument).attr('checked', !settings.hideQrCode );
  }

  function renderCards(issueKeyList) {
    var promises = [];

    var printFrameDocument = global.printFrame.document;

    printFrameDocument.open();
    printFrameDocument.write("<head/><body></body>");
    printFrameDocument.close();

    $("head", printFrameDocument).append(cardElementStyle());
    $("body", printFrameDocument).append("<div id='preload'/>");
    $("#preload", printFrameDocument).append("<div class='zigzag'/>");

    console.log("load " + issueKeyList.length + " issues...");

    $.each(issueKeyList, function(index, issueKey) {
      var card = cardElement(issueKey);
      card.attr("index", index);
      card.find('.issue-id').text(issueKey);
      $("body", printFrameDocument).append(card);

      promises.push(global.appFunctions.getCardData(issueKey).then(function(cardData) {
        console.log("cardData: " + JSON.stringify(cardData,2,2));
        ga('send', 'event', 'card', 'generate', cardData.type);
        fillCard(card, cardData);
        redrawCards();
      }));
    });

    console.log("wait for issues loaded...");
    return Promise.all(promises).then(function() {
      console.log("...all issues loaded.");
      redrawCards();
    });
  }

  function redrawCards() {
    styleCards();
    scaleCards();
    cropCards();
    resizeIframe(global.printFrame);
  }


  function fillCard(card, data) {
    //Key
    card.find('.issue-id').text(data.key);
    
    //Color
    var colid = data.key.split("-").pop()
    card.find('.issue-color").addClass("c" + colid);

    //Type
    card.find(".issue-icon").attr("type", data.type);

    //Summary
    card.find('.issue-summary').text(data.summary);

    //Description
    if (data.description) {
      card.find('.issue-description').html(data.description);
    } else {
      card.find(".issue-description").addClass("hidden");
    }

    //Assignee
    if (data.assignee) {
      if (data.avatarUrl) {
        card.find(".issue-assignee").css("background-image", "url('" + data.avatarUrl + "')");
      } else {
        card.find(".issue-assignee").text(data.assignee[0].toUpperCase());
      }
    } else {
      card.find(".issue-assignee").remove();
    }

    //Due-Date
    if (data.dueDate) {
      card.find(".issue-due-date").text(data.dueDate);
    } else {
      card.find(".issue-due-box").remove();
    }

    //Attachment
    if (data.hasAttachment) {} else {
      card.find('.issue-attachment').remove();
    }

    //Story Points
    if (data.storyPoints) {
      card.find(".issue-estimate").text(data.storyPoints);
    } else {
      card.find(".issue-estimate").remove();
    }

    //Epic
    if (data.superIssue) {
      card.find(".issue-epic-id").text(data.superIssue.key);
      card.find(".issue-epic-name").text(data.superIssue.summary);
    } else {
      card.find(".issue-epic-box").remove();
    }

    //QR-Code
    var qrCodeUrl = 'https://chart.googleapis.com/chart?cht=qr&chs=256x256&chld=L|1&chl=' + encodeURIComponent(data.url);
    card.find(".issue-qr-code").css("background-image", "url('" + qrCodeUrl + "')");
  }

  function styleCards() {
    var settings = global.settings;
    var printFrame = global.printFrame

    // hide/show description
    $(".issue-description", printFrame.document).toggle(!settings.hideDescription);
    // hide/show assignee
    $(".issue-assignee", printFrame.document).toggle(!settings.hideAssignee);
    // hide/show assignee
    $(".issue-due-box", printFrame.document).toggle(!settings.hideDueDate);
    // hide/show cr code
    $(".issue-qr-code", printFrame.document).toggle(!settings.hideQrCode);

    // enable/disable single card page
    $(".card", printFrame.document).css({ 'page-break-after' : '', 'float' : '', 'margin-bottom': '' });
    if (settings.singleCardPage) {
      $(".card", printFrame.document).css({ 'page-break-after': 'always', 'float': 'none', 'margin-bottom': '20px' });
    } else {
      $(".card", printFrame.document).each(function(index, element){
        if(index % (settings.colCount * settings.rowCount ) >= (settings.colCount * (settings.rowCount - 1))){
          $(element).css({ 'margin-bottom': '20px' });
        }
      });
    }
  }

  function scaleCards() {
    var settings = global.settings;
    var printFrame = global.printFrame;

    var scaleValue = settings.scale * 2.0;
    var scaleRoot;
    if(scaleValue < 0) {
      scaleRoot = 1.0 / (1.0 - scaleValue);
    } else {
      scaleRoot = 1.0 * (1.0 + scaleValue);
    }

    var rowCount = settings.rowCount;
    var columnCount = settings.colCount;

    // scale

    // reset scale
    $("html", printFrame.document).css("font-size", scaleRoot + "cm");
    $("#gridStyle", printFrame.document).remove();

    // calculate scale

    var bodyElement = $("body", printFrame.document);
    var cardMaxWidth = Math.floor(bodyElement.outerWidth() / columnCount);
    var cardMaxHeight = Math.floor(bodyElement.outerHeight() / rowCount);

    var cardElement = $(".card", printFrame.document);
    var cardMinWidth = cardElement.css("min-width").replace("px", "");
    var cardMinHeight = cardElement.css("min-height").replace("px", "");

    var scaleWidth = cardMaxWidth / cardMinWidth ;
    var scaleHeight = cardMaxHeight / cardMinHeight ;
    var scale = Math.min(scaleWidth, scaleHeight, 1);

    // scale
    $("html", printFrame.document).css("font-size", ( scaleRoot * scale ) + "cm");

    // grid size
    var style = document.createElement('style');
    style.id = 'gridStyle';
    style.type = 'text/css';
    style.innerHTML = ".card { "+
    "width: calc( 100% / " + columnCount + " );" +
    "height: calc( 100% / " + rowCount + " );"+
    "}";
    $("head", printFrame.document).append(style);
  }

  function cropCards() {
    var cardElements = global.printFrame.document.querySelectorAll(".card");
    forEach(cardElements, function(cardElement) {
      var cardContent = cardElement.querySelectorAll(".card-body")[0];
      if (cardContent.scrollHeight > cardContent.offsetHeight) {
        cardContent.classList.add("zigzag");
      } else {
        cardContent.classList.remove("zigzag");
      }
    });
  }

  function forEach(array, callback) {
    for (i = 0; i < array.length; i++) {
      callback(array[i]);
    }
  }

  function closePrintPreview() {
    $("#card-printer-iframe").remove();
  }

  //############################################################################################################################
  //############################################################################################################################
  //############################################################################################################################

  // http://www.cssdesk.com/T9hXg

  function printPreviewElement() {
    var result = $('<div/>').html(global.printPreviewHtml).contents();

    // info
    result.find("#report-issue").click(function(event) {
      window.open('https://github.com/tkejzlar/Jira-Issue-Card-Printer/issues');
      return false;
    });

    result.find("#about").click(function(event) {
      window.open('http://rmxro.blogspot.de/2014/01/jira-issue-card-printer-bookmarklet.html');
      return false;
    });

    // enable single card page

    result.find("#single-card-page-checkbox").click(function() {
      global.settings.singleCardPage = this.checked;
      saveSettings();
      redrawCards();
      return true;
    });

    // hide description

    result.find("#description-checkbox").click(function() {
      global.settings.hideDescription = !this.checked;
      saveSettings();
      redrawCards();
      return true;
    });

    // show assignee

    result.find("#assignee-checkbox").click(function() {
      global.settings.hideAssignee = !this.checked;
      saveSettings();
      redrawCards();
      return true;
    });

    // show due date

    result.find("#due-date-checkbox").click(function() {
      global.settings.hideDueDate = !this.checked;
      saveSettings();
      redrawCards();
      return true;
    });

    // show QR Code

    result.find("#qr-code-checkbox").click(function() {
      global.settings.hideQrCode = !this.checked;
      saveSettings();
      redrawCards();
      return true;
    });

    // scale font

    result.find("#scaleRange").on("input", function() {
      global.settings.scale = $(this).val();
      saveSettings();
      redrawCards();
    });

    // grid

    result.find("#rowCount").on("input", function() {
      global.settings.rowCount = $(this).val();
      saveSettings();
      redrawCards();
    });
    result.find("#rowCount").click(function() {
      this.select();
    });


    result.find("#columnCount").on("input", function() {
      global.settings.colCount = $(this).val();
      saveSettings();
      redrawCards();
    });
    result.find("#columnCount").click(function() {
      this.select();
    });


    // print

    result.find("#card-print-dialog-print")
      .click(function(event) {
        print();
        return false;
      });

    // closePrintPreview

    result.find("#card-print-dialog-cancel")
      .click(function(event) {
        closePrintPreview();
        return false;
      });

    result.click(function(event) {
        if (event.target == this) {
          closePrintPreview();
        }
      return true;
    });

    $(document).keyup(function(e) {
      if (e.keyCode == 27) { // ESC
        closePrintPreview();
      }
    });

    // prevent background scrolling
    result.scroll(function(event) {
        return false;
    });

    return result;
  }

  function printPreviewElementStyle() {
    var result = $(document.createElement('style'))
      .attr("type", "text/css")
      .html(global.printPreviewCss);
    return result;
  }

  // card layout: http://jsfiddle.net/rmxro/ykbLb2pw/76

  function cardElement(issueKey) {
    var result = $('<div/>').html(global.cardHtml).contents()
      .attr("id", issueKey)
    return result;
  }

  function cardElementStyle() {
    var result = $(document.createElement('style'))
      .attr("type", "text/css")
      .html(global.cardCss);
    return result;
  }

  //############################################################################################################################

  function parseBool(text, def){
    if(text == 'true') return true;
    else if ( text == 'false') return false;
    else return def;
  }

  function appendScript(url, callback) {

    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.src = url;

    // Then bind the event to the callback function.
    // There are several events for cross browser compatibility.
    script.onreadystatechange = callback;
    script.onload = callback;

    head.appendChild(script);
  }

  function readCookie(name) {
    var cookies = document.cookie.split('; ');

    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].split('=');
      if (cookie[0] == name) return cookie[1];
    }
    return null;
  }

  function writeCookie(name, value) {
    var expireDate = new Date();  // current date & time
    expireDate.setFullYear(expireDate.getFullYear() + 1) // one year
    document.cookie = name + "=" + value + "; path=/; expires=" + expireDate.toGMTString();

    // cleanup due to former path
    document.cookie = name + "=; expires=" + new Date(0).toGMTString();
  }

  function httpGetCORS(){
    //arguments[0] = 'https://jsonp.afeld.me/?url=' + arguments[0];
    //arguments[0] = 'http://cors.io/?u=' + arguments[0];
    //arguments[0] = 'https://crossorigin.me/' + arguments[0];
    arguments[0] = 'http://cors-anywhere.herokuapp.com/' + arguments[0];
    
    return httpGet.apply(this, arguments);
    console.log("httpGetCORS for " + arguments[0] + " done.");
  }

  function httpGet(){
    return Promise.resolve($.get.apply(this, arguments));
  }

  function httpGetJSON(){
    return Promise.resolve($.getJSON.apply(this, arguments));
  }

  function multilineString(commentFunction) {
    return commentFunction.toString()
      .replace(/^[^\/]+\/\*!?/, '')
      .replace(/\*\/[^\/]+$/, '');
  }

  function resizeIframe(iframe) {
    iframe = $(iframe);
    iframe.height(iframe[0].contentWindow.document.body.height);
  }
  //############################################################################################################################
  //############################################################################################################################
  //############################################################################################################################

  function addStringFunctions() {

    //trim string - remove leading and trailing whitespaces
    if (!String.prototype.trim) {
      String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, '');
      };
    }

    if (!String.prototype.startsWith) {
      String.prototype.startsWith = function(str) {
        return this.slice(0, str.length) == str;
      };
    }

    if (!String.prototype.endsWith) {
      String.prototype.endsWith = function(str) {
        return this.slice(-str.length) == str;
      };
    }

    if (!String.prototype.toCamelCase) {
      String.prototype.toCamelCase = function() {
        // remove all characters that should not be in a variable name
        // as well underscores an numbers from the beginning of the string
        var s = this.replace(/([^a-zA-Z0-9_\- ])|^[_0-9]+/g, "").trim().toLowerCase();
        // uppercase letters preceeded by a hyphen or a space
        s = s.replace(/([ -]+)([a-zA-Z0-9])/g, function(a, b, c) {
          return c.toUpperCase();
        });
        // uppercase letters following numbers
        s = s.replace(/([0-9]+)([a-zA-Z])/g, function(a, b, c) {
          return b + c.toUpperCase();
        });
        return s;
      }
    }
  }

  function formatDate(date) {
    var shortMonths = {'Jan': 1, 'Feb':2, 'Mar':3, 'Apr':4, 'May':5, 'Jun':6, 'Jul':7, 'Aug':8, 'Sep':9, 'Oct':10, 'Nov':11, 'Dec':12 };
    var dateSplit = date.toString().split(" ");
    // Mo 28.11.
    return dateSplit[0] + " " + dateSplit[2] + "." + shortMonths[dateSplit[1]] + ".";
  }

  // APP Specific Functions
  //############################################################################################################################
  //############################################################################################################################
  //############################################################################################################################

  var jiraFunctions = (function(module) {

    module.getSelectedIssueKeyList = function() {

      //Issues
      if (/.*\/issues\/\?jql=.*/g.test(document.URL)) {
        var jql = document.URL.replace(/.*\?jql=(.*)/, '$1');
        var jqlIssues = [];
        var url = '/rest/api/2/search?jql=' + jql + "&maxResults=500&fields=key";
        console.log("IssueUrl: " + url);
        //console.log("Issue: " + issueKey + " Loading...");
        $.ajax({
          type: 'GET',
          url: url,
          data: {},
          dataType: 'json',
          async: false,
          success: function(responseData) {
            console.log("responseData: " + responseData.issues);

            $.each(responseData.issues, function(key, value) {
                jqlIssues.push(value.key);
            });
          },
        });
        console.log("jqlIssues: " + jqlIssues);
        return jqlIssues;
      }

      //Browse
      if (/.*\/browse\/.*/g.test(document.URL)) {
        return [document.URL.replace(/.*\/browse\/([^?]*).*/, '$1')];
      }

      //Project
      if (/.*\/projects\/.*/g.test(document.URL)) {
        return [document.URL.replace(/.*\/projects\/[^\/]*\/[^\/]*\/([^?]*).*/, '$1')];
      }

      // RapidBoard
      if (/.*\/secure\/RapidBoard.jspa.*/g.test(document.URL)) {
        return $('div[data-issue-key].ghx-selected').map(function() {
          return $(this).attr('data-issue-key');
        });
      }

      return [];
    };

    module.getCardData = function(issueKey) {
      var promises = [];
      var issueData = {};

      promises.push(module.getIssueData(issueKey).then(function(data) {
        var promises = [];
        issueData.key = data.key;
        issueData.type = data.fields.issuetype.name.toLowerCase();
        issueData.summary = data.fields.summary;
        issueData.description = data.renderedFields.description;

        if (data.fields.assignee) {
          issueData.assignee = data.fields.assignee.displayName;
          var avatarUrl = data.fields.assignee.avatarUrls['48x48'];
          if (avatarUrl.indexOf("ownerId=") >= 0) {
            issueData.avatarUrl = avatarUrl;
          }
        }

        if (data.fields.duedate) {
          issueData.dueDate = formatDate(new Date(data.fields.duedate));
        }

        issueData.hasAttachment = data.fields.attachment.length > 0;
        issueData.storyPoints = data.fields.storyPoints;

        if (data.fields.parent) {
          promises.push(module.getIssueData(data.fields.parent.key).then(function(data) {
            issueData.superIssue = {};
            issueData.superIssue.key = data.key;
            issueData.superIssue.summary = data.fields.summary;
          }));
        } else if (data.fields.epicLink) {
          promises.push(module.getIssueData(data.fields.epicLink).then(function(data) {
            issueData.superIssue = {};
            issueData.superIssue.key = data.key;
            issueData.superIssue.summary = data.fields.epicName;
          }));
        }

        issueData.url = window.location.origin + "/browse/" + issueData.key;

        //LRS Specific field mapping
        if (true) {
          //Desired-Date
          if (data.fields.desiredDate) {
            issueData.dueDate = formatDate(new Date(data.fields.desiredDate));
          }
        }

        return Promise.all(promises);
      }));

      return Promise.all(promises).then(function(results){return issueData;});
    };

    module.getIssueData = function(issueKey) {
      //https://docs.atlassian.com/jira/REST/latest/
      var url = '/rest/api/2/issue/' + issueKey + '?expand=renderedFields,names';
      console.log("IssueUrl: " + url);
      //console.log("Issue: " + issueKey + " Loading...");


      return httpGetJSON(url).then(function(responseData) {
        //console.log("Issue: " + issueKey + " Loaded!");
        // add custom fields with field names
        $.each(responseData.names, function(key, value) {
          if (key.startsWith("customfield_")) {
            var fieldName = value.toCamelCase();
            //console.log("add new field: " + fieldName + " with value from " + key);
            responseData.fields[fieldName] = responseData.fields[key];
          }
        });
        return responseData;
      });
    };

    return module;
  }({}));

  var youTrackFunctions = (function(module) {

    module.getSelectedIssueKeyList = function() {
      //Detail View
      if (/.*\/issue\/.*/g.test(document.URL)) {
        return [document.URL.replace(/.*\/issue\/([^?]*).*/, '$1')];
      }

      // Agile Board
      if (/.*\/rest\/agile.*/g.test(document.URL)) {
        return $('div.sb-task-focused').map(function() {
          return $(this).attr('id');
        });
      }

      return [];
    };

    module.getCardData = function(issueKey) {
      var promises = [];
      var issueData = {};

      promises.push(module.getIssueData(issueKey).then(function(data) {
        issueData.key = data.id;
        issueData.type = data.field.type[0];
        issueData.summary = data.field.summary;
        issueData.description = data.field.description;

        if (data.field.assignee) {
          issueData.assignee = data.field.assignee[0].fullName;
        }

        if (data.field.attachments) {
          issueData.hasAttachment = data.field.attachments.length > 0;
        }

        issueData.url = window.location.origin + "/youtrack/issue/" + issueData.key;


      }));

      return Promise.all(promises).then(function(results){return issueData;});
    };

    module.getIssueData = function(issueKey) {
      var url = '/youtrack/rest/issue/' + issueKey + '?';
      console.log("IssueUrl: " + url);
      //console.log("Issue: " + issueKey + " Loading...");
      return httpGetJSON(url).then(function(responseData) {
        //console.log("Issue: " + issueKey + " Loaded!");
        $.each(responseData.field, function(key, value) {
          // add fields with field names
          var fieldName = value.name.toCamelCase();
          //console.log("add new field: " + newFieldId + " with value from " + fieldName);
          responseData.field[fieldName] = value.value;
        });
        return responseData;
      });
    };

    return module;
  }({}));

  var pivotalTrackerFunctions = (function(module) {

    module.getSelectedIssueKeyList = function() {
      //Single Story
      if (/.*\/stories\/.*/g.test(document.URL)) {
        return [document.URL.replace(/.*\/stories\/([^?]*).*/, '$1')];
      }

      // Board
      if (/.*\/projects\/.*/g.test(document.URL)) {
        return $('.story[data-id]:has(.selected)').map(function() {
          return $(this).attr('data-id');
        });
      }

      return [];
    };

    module.getCardData = function(issueKey) {
      var promises = [];
      var issueData = {};

      promises.push(module.getIssueData(issueKey).then(function(data) {
        issueData.key = data.id;
        issueData.type = data.kind.toLowerCase();
        issueData.summary = data.name;
        issueData.description = data.description;

        if (data.owned_by && data.owned_by.length > 0) {
          issueData.assignee = data.owner_ids[0].name;
        }

        if (data.deadline) {
          issueData.dueDate = formatDate(new Date(data.deadline));
        }

        // TODO
        issueData.hasAttachment = false;
        issueData.storyPoints = data.estimate;

        issueData.url = data.url;
      }));

      return Promise.all(promises).then(function(results){return issueData;});
    };

    module.getIssueData = function(issueKey) {
      //http://www.pivotaltracker.com/help/api
      var url = 'https://www.pivotaltracker.com/services/v5/stories/' + issueKey + "?fields=name,kind,description,story_type,owned_by(name),comments(file_attachments(kind)),estimate,deadline";
      console.log("IssueUrl: " + url);
      //console.log("Issue: " + issueKey + " Loading...");
      return httpGetJSON(url);
    };

    return module;
  }({}));

  var trelloFunctions = (function(module) {

    module.getSelectedIssueKeyList = function() {
      //Card View
      if (/.*\/c\/.*/g.test(document.URL)) {
        return [document.URL.replace(/.*\/c\/([^/]*).*/g, '$1')];
      }

      return [];
    };

    module.getCardData = function(issueKey, callback) {
      var promises = [];
      var issueData = {};

      promises.push(module.getIssueData(issueKey).then(function(data) {
        issueData.key = data.idShort;

        //  TODO get kind from label name
        // issueData.type = data.kind.toLowerCase();

        issueData.summary = data.name;
        issueData.description = data.desc;

        if (data.members && data.members.length > 0) {
          issueData.assignee = data.members[0].fullName;
          issueData.avatarUrl = "https://trello-avatars.s3.amazonaws.com/" + data.members[0].avatarHash + "/170.png";
        }

        if (data.due) {
          issueData.dueDate = formatDate(new Date(data.due));
        }

        issueData.hasAttachment = data.attachments > 0;
        issueData.url = data.shortUrl;
      }));

      return Promise.all(promises).then(function(results){return issueData;});
    };

    module.getIssueData = function(issueKey) {
      var url = "https://trello.com/1/cards/" + issueKey + "?members=true";
      console.log("IssueUrl: " + url);
      //console.log("Issue: " + issueKey + " Loading...");
      return httpGetJSON(url);
    };

    return module;
  }({}));
})();
