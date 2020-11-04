/* eslint-disable new-cap */
import _ from "lodash";
import interact from "interactjs";
import Handlebars from "handlebars";
import store from "store";
import ShowcasePage from "./showcasePage";

export default class showcaseCleanshot extends ShowcasePage {
  // #region getter/setter

  // #endregion
  /**
   * One-time initialization
   */
  init() {
    super.init();
    this.initCache();

    // current querystring without "?" prefix
    const querystring = location.search.substr(1);
    this._loadApi(querystring, $(".viewport"), false).then(api => {
      this.addIframe();
      try {
      this.updatePanes();
      this.initGeneratorNav();
      this.handleCollapseAdviceSummaries();
      this.handleCollapseAssumptionGroup();
    }catch(e){console.error(e)}
    });

    // add link back to main showcase
    $("#logo_link").prop("href", `${this.baseUrl}/${location.search}`);

    this.setupDraggables();
  }

  initGeneratorNav() {
    $("header .nav-pills").on("click", ".nav-link", e => {
      const $el = $(e.currentTarget);
      const [,type] = $el.prop("href").split("#");
      $(".screenshot-zone").removeAttr("class").addClass("screenshot-zone").addClass(`ss-type--${type}`);
      $el.parent().siblings().find(".nav-link").removeClass("active");
      $el.addClass("active");
      $("iframe").prop("scrolling", type == "full" ? "yes" : "no");
      
      $('iframe').contents().find("body").addClass("showcase--redux_isFramed_" + type)
    })
  }

  /**
   * Update panes. This fn is called each time the API updates.
   */
  updatePanes(){
    this.mapData();
    this.updateMainPane();
    this.updateAssumptionsList();
    this.updateRecommendationsList();
  }

  /**
   * Map data from API for this showcase's handlebars templates
   */
  mapData() {
    // setup "display" card — either question or "advice".
    // `api.advice` is an array of every input + advice node
    this.api.display = _.last(this.api.advice) || {};
    // build collection of just answers & assumptions
    this.api.answers = [].concat(this.api.advice||[]).filter(a => { return a.type == "INPUT_REQUEST"; }).map((a, i) => {
      a.idx = i;
      return a;
    });

    // remove last item, it's always an unanswered question
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.answers.pop();
    }

    // assumptions are grouped, answers are not
    const ASSUMPTIONS_UNGROUPED = "Assumptions";
    const ASSUMPTIONS_UNGROUPED_ID = `assumptions_${this.api.adviceset.id}`;
    this.api.assumptions = _.groupBy(this.api.answers, (a) => {
      return (a.tagGroup) ? a.tagGroup.name : ASSUMPTIONS_UNGROUPED;
    });

    // go through each assumption group and set open/close state
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.map(a => {
        // add tagGroup because these items don't have one assigned
        if (key == ASSUMPTIONS_UNGROUPED) {
          a.tagGroup = {
            name: ASSUMPTIONS_UNGROUPED,
            id: ASSUMPTIONS_UNGROUPED_ID
          }
        }
        // add `_isOpen` flag to each item
        a._isOpen = store.get(`assumption_${a.tagGroup.id}_${this.api.adviceset.id}`, true);
        return a;
      });
    });

    this.mapAdviceData();
  }

  /**
   * Slight speed update to cache frequently-used templates and selectors
   */
  initCache() {
    // cache templates
    this.TEMPLATES = {
      "InputRequest": Handlebars.compile($("#tmpl_adviceInputRequest").html()),
      // "Advice": Handlebars.compile($("#tmpl_adviceAdvice").html()),
      "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      "Assumptions": Handlebars.compile($("#tmpl_assumptionsList").html()),
      "QuestionsAnswers": Handlebars.compile($("#tmpl_answersList").html()),
    };
  }

  /**
	 * Update assumptions/answers/history list
	 */
  updateAssumptionsList(){
    // do we have ANY assumptions/answers yet?
    // show or hide depending
    // simple helper for UX
    this.api._answersExist = this.api.answers.length > 0;
    $(".assumptions-container > div").css("visibility", this.api._answersExist ? "visible" : "hidden");
    $(".assumptions-outer-container").toggleClass("assumptions-outer-container--empty", !this.api._answersExist);
    // only show expand button if there's grouped assumptions besides "ungrouped"
    $(".assumption-expander").toggle(_.without(Object.keys(this.api.assumptions), "ungrouped").length > 0);

    // render
    const str = this.TEMPLATES["QuestionsAnswers"](this.api);
    const strAssump = this.TEMPLATES["Assumptions"](this.api);
    $(".answers").html(str);
    $(".assumptions").html(strAssump);
  }

  /**
	 * Update advice list by group
	 */
  updateRecommendationsList() {
    // simple helper for UX
    this.api._recommendationsExist = _.flatMap(this.api.recommendations).length > 0;

    // render
    const str = this.TEMPLATES["Recommendations"](this.api);
    $(".list-all-recommendations").html(str);

    // One more step....
    this._updateForPrimaryAdvice();
    this._setupChartsAll();
  }

  updateMainPane() {
    // update the window title
    this.windowTitle = `${this.api.adviceset.title} - Screenshot Generator`;

    this._setCurrentIdx();
    if (this.api.display.type == "INPUT_REQUEST") {
      this._updateForInputRequest();
    } else {
      // see `updateRecommendationsList`
    }
  }

  /**
	 * Insert iframe into DOM
	 */
  addIframe() {
    const iframeSrc = `${this.baseUrl}/${location.search}`;
    $(".viewport").append(`<iframe height=100% width=100% frameborder=0 border=0 src="${iframeSrc}"></iframe>`);
  }

  /**
   * Template update for "primary advice" (last advice in highest weighted group)
   *
   */
  _updateForPrimaryAdvice() {
    // if this is the LAST advice, hide center column and move advice list into center focus
    if (this.api.display._isLast) {
      // if there's < 3 expandable advice recommendations displayed, expand them automatically
      if (_.flatMap(this.api.recommendations).filter(a => { return a.summary }).length < 3) {
        setTimeout(()=>{
          $(".advice-list .collapse").collapse("show");
        }, 50);
      }
    }
  }

  /**
   * Template update for INPUT_REQUEST
   */
  _updateForInputRequest() {
    // render
    const str = this.TEMPLATES["InputRequest"](this.api);
    $(".advice").html(str);
  
    // set value
    this._setValue();
    // set input masks
    this._handleInputMasks($(".advice"));
  }

  /**
   * Sets up chart
   * @param {boolean} isChart
   */
  setupChart(isChart, chartId) {
    // setup the chart...
    if (isChart) {
      const $chart = $(`[data-id=${chartId}]`);
      const { src } = $chart.data();
      // parent container
      const containerW = $chart.parents(".advice").outerWidth();
      const $iframe = $chart.find("iframe");
      // set chart container size
      $chart.css({
        height: 400,
        width: containerW
      });

      $iframe.on("load", e => {
        // specific data chart is expecting
        // TODO: clean this up in the chart code
        window.jga.config = _.extend(window.jga.config, {
          adviceSetId: this.api.adviceset.id,
          bgColor: "#fff",
          colors: ["#1C2145", "#3956EF"],
          width: containerW,
          height: 400
        });
        window.jga.advice = {
          session: Object.assign({
            ruleSetId: this.api.adviceset._id,
            ruleId: this.api.display.ruleId,
          }, this.api.params)
        }
        const data = {
          advice: window.jga.advice,
          config: window.jga.config
        }
        $iframe.get(0).contentWindow.postMessage(data, "*");
      });
      $iframe.prop("src", src);
    }
  }

  /**
   * Sets up all charts
   */
  _setupChartsAll() {
    // quickly find all charts and set them up
    _.flatMap(this.api.recommendations).concat([this.api.display]).filter(a => {
      return a.attachment && a.attachment._isInteractiveChart;
    }).map(a => {
      return a.attachment;
    }).forEach(chart => {
      setTimeout(() => {
        this.setupChart(true, chart.id);
      }, 500);
    });
  }

  setupDraggables() {
    const $draggables = $(".floater");
    $draggables.each((i, el) => {
      // const $el = $(el);
      // draggable floaters for assumptions + advice
      // https://interactjs.io/docs/draggable
      const position = { x: 0, y: 0 }
      // let startPos;
      // let posDisplay;
      const $coords = $("#coords");
      interact(el).draggable({
        listeners: {
          start(event) {
            $coords.text("");
            // startPos = $el.position();
          },
          end(event) {
            // $coords.text("");
          },
          move(event) {
            position.x += event.dx;
            position.y += event.dy;

            event.target.style.transform = `translate(${position.x}px, ${position.y}px)`;
            $coords.text(`${position.x.toFixed(0)} x ${position.y.toFixed(0)}`);
          },
        },
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: "parent" // .screenshot-zone
          })
        ]
      });
    })
  }

  /**
   * Listener for opening/closing advice summaries
   */
  handleCollapseAdviceSummaries() {
    $(".list-all-recommendations").on("show.bs.collapse", ".collapse", (e) => {
      const $this = $(e.currentTarget);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      const isGroupHeader = $toggler.hasClass("group-toggler") && $toggler.find("i").length;
      if (isGroupHeader) {
        $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
      } else {
        $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
      }
    });

    $(".list-all-recommendations").on("hidden.bs.collapse", ".collapse", (e) => {
      const $this = $(e.currentTarget);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      const isGroupHeader = $toggler.hasClass("group-toggler");
      if (isGroupHeader) {
        $toggler.find("i").addClass("fa-chevron-right").removeClass("fa-chevron-down");
      } else {
        $toggler.find("i").addClass("fa-chevron-right").removeClass("fa-chevron-down");
      }
    });
  }

  /**
   * Listener for opening/closing assumption groups
   */
  handleCollapseAssumptionGroup() {
    $(".assumptions").on("show.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      const { groupId } = $this.find("li").first().data();
      store.set(`assumption_${groupId}_${this.api.adviceset.id}`, true);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
    });

    $(".assumptions").on("hidden.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      const { groupId } = $this.find("li").first().data();
      store.set(`assumption_${groupId}_${this.api.adviceset.id}`, false);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").removeClass("fa-chevron-down").addClass("fa-chevron-right");
    });
  }

  // #region event handlers

  // #endregion
}