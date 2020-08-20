/* eslint-disable new-cap */
import _ from "lodash";
import Handlebars from "handlebars";
import Mousetrap from "mousetrap";
import qs from "querystring";
import store from "store";
import ShowcasePage from "./showcasePage";

export default class showcaseFull extends ShowcasePage {

  /**
   * One-time initialization
   */
  init() {
    super.init();
    this.initCache();
    // current querystring without "?" prefix
    const querystring = location.search.substr(1);
    this._loadApi(querystring, $(".row .advice")).then(api => {
      // on page load, save current state
      this.history.replace(`${this.baseUrl}/${location.search}`, this.api);
      // DOM updates
      this.updateAdviceSetDetails();
      this.updatePanes();
      // events
      this.handleClickContinue();
      this.handleClickBack();
      this.handleClickAssumption();
      this.handleCollapseAdviceSummaries();
      this.handleCollapseAssumptionGroup();
      this.listenForUrlChanges();
      this.handleClickExpandControls();
      // this.handleResizeChart();

      // keyboard shortcuts

      // expand/collapse advice
      Mousetrap.bind("a", () => {
        $("a[data-expand=advice]").click();
      });
      // expand/collapse assumptions
      Mousetrap.bind("s", () => {
        $("a[data-expand=assumptions]").click();
      });
      // show toast with keyboard shortcut map
      Mousetrap.bind("?", () => {
        this.showToast(undefined,{
          title: "Keyboard Shortcuts",
          message: "Press <code>a</code> to expand advice.<br>Press <code>s</code> to expand assumptions.",
          delay: 5000
        });
      });
    });

    // when data is updated after page-load, use this fn
    this.$loadingContainer = $(".list-all-recommendations");
    this.updateFn = (data) => {
      // update content
      this.updatePanes();
      // save state
      this.history.push(`${this.baseUrl}/?${qs.stringify(this.api.params)}`, this.api);
    }
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes(){
    this.mapData();
    this.updateMainPane();
    this.updateAssumptionsList();
    this.updateRecommendationsList();
    this.updateVariablesList();
  }

  // #region event handlers
  /**
   * "Next" button handler
   */
  handleClickContinue() {
    this.$advice.on("submit", "form", e => {
      const $form = $(e.currentTarget);

      $("html, body").animate({ scrollTop: 0 });

      // convert values from masked to unmasked for form submission
      const $inputs = this._findFormInput($form);
      $inputs.each((i, el) => {
        const $input = $(el);
        const { inputmask } = $input.data();

        if (inputmask) {
          const unmaskedval = inputmask.unmaskedvalue();
          inputmask.remove();
          $input.val(unmaskedval);
        }

        // while we're here, convert percent to precision value
        if ($input.is("input[data-type=Percent]")) {
          $input.val($input.val() / 100);
        }
      });

      const data = $form.serialize();

      this._loadApi(data, $(".row .advice")).then(()=> {
        this.updateFn();
      });

      return false; // don't submit form
    });
  }

  /**
   * "Back" button handler
   */
  handleClickBack() {
    this.$advice.on("click", "a[data-action=back]", e => {
      e.preventDefault();
      const { _currIdx } = this.api.display;
      const display = this.api.answers.find((a) => { return a.idx == _currIdx - 1; });
      if (!display) { return; }
      $("html, body").animate({ scrollTop: 0 });
      // temp override `display` global prop to insert question into HTML
      this.api.display = display;
      this.updateMainPane();
    });
  }

  /**
   * Click handler for assumptions or Q&A
   */
  handleClickAssumption() {
    $(".answers, .assumptions").on("click", ".a > a, a.statement", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      $("html, body").animate({ scrollTop: 0 });
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = _.flatMap(this.api.assumptions).find((a) => { return a.idx == data.idx; });
      this.api.display = answer;
      this.api.display.idx = answer.idx;
      this.updateMainPane();
    });
  }

  /**
   * Listener for opening/closing advice summaries
   */
  handleCollapseAdviceSummaries() {
    $(".advice-list").on("show.bs.collapse", "li .collapse", (e) => {
      const $this = $(e.currentTarget);
      const $toggler = $this.prev();// $(`a[aria-controls=${$this.prop("id")}]`);
      const $faLi = $toggler.prev("span.fa-li");
      $faLi.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
    });

    $(".advice-list").on("hidden.bs.collapse", "li .collapse", (e) => {
      const $this = $(e.currentTarget);
      const $toggler = $this.prev();// $(`a[aria-controls=${$this.prop("id")}]`);
      const $faLi = $toggler.prev("span.fa-li");
      $faLi.find("i").removeClass("fa-chevron-down").addClass("fa-chevron-right");
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

  /**
   * Handle expando/collapso links on sidebar
   */
  handleClickExpandControls() {
    $("main").on("click", "a[data-expand]", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const { expand } = $this.data();

      $this.tooltip("hide");

      let $collapsibles;
      if (expand == "assumptions") {
        $collapsibles = $(".assumptions-list.collapse");
      } else if (expand == "advice") {
        $collapsibles = $(".advice-list").find(".collapse");
      }

      // open or close?
      const { collapsed = true } = $this.data();
      const collapse = collapsed ? "show" : "hide";
      $collapsibles
        .collapse(collapse)
        .on("shown.bs.collapse", e => { this._toggleCollapseLink($this, true) })
        .on("hidden.bs.collapse", e => { this._toggleCollapseLink($this, false) });

      this._toggleCollapseLink($this, collapse == "show");
    });
  }

  /**
   * The interactive chart embed is inside an iframe and when the window resizes
   * the iframe needs to be re-loaded.
   */
  handleResizeChart() {
    let timer;
    $(window).resize(() => {
      if (this.api.display.type == "ADVICE") {
        if (timer) {
          window.clearTimeout(timer);
        }
        timer = setTimeout(() => {
          this.updateMainPane();
        }, 500);
      }
    });
  }
  // #endregion

  // #region templating
  /**
	 * Update center Advice/Question pane
	 */
  updateMainPane(){
    // update the window title
    this.windowTitle = `${this.api.adviceset.title} - ${this.api.adviceset.owner.name}`;

    this._setCurrentIdx();

    // render
    $(".center-col").removeClass("transition-hide").show();
    $(".right-col").removeClass("centered col-lg-10").addClass("col-lg-6");

    if (this.api.display.type == "INPUT_REQUEST") {
      this._updateForInputRequest();
    } else {
      // if this is the LAST advice, hide center column and move advice list into center focus
      if (this.api.display._isLast) {
        $(".center-col").hide();// .addClass("transition-hide");
        if (this.isTaffrail) {
          $(".right-col").hide().removeClass("col-lg-6").addClass("centered col-lg-10");
        } else {
          $(".right-col").addClass("centered");
        }

        // if there's < 3 expandable advice recommendations displayed, expand them automatically
        if (_.flatMap(this.api.recommendations).filter(a => { return a.summary }).length < 3) {
          setTimeout(()=>{
            $(".advice-list").find("a[data-toggle=collapse]").click();
          }, 450);
        }

        if (this.isTaffrail) {
          $(".right-col").show();
        }
      }
      // unused center pane
      // this._updateForAdvice();
    }
  }

  // #region templating utils
  /**
   * Template update for INPUT_REQUEST
   */
  _updateForInputRequest() {
    const isLastAndAnswered = this.api.display.id == _.last(this.api.advice).id && this.api.display.value != "\"null\"";
    // console.log(isLastAndAnswered)
    if (isLastAndAnswered) {
      // this.api.display = Object.assign(this.api.display, {
      //   question: "Advice Engine Response",
      //   explanation: "This rule has been evaluated, see variable data for export.",
      //   form: {
      //     fieldType: "NONE",
      //     result: this.api.display.value
      //   }
      // });
    }
    // render
    const str = this.TEMPLATES["InputRequest"](this.api);
    this.$advice.html(str);

    // set value
    this._setValue();
    // set input masks
    this._handleInputMasks();
    // focus input
    this._focusFirstInput();
    // highlight active assumption/question
    this._setAssumptionActive();
  }

  /**
   * Template update for ADVICE
   */
  _updateForAdvice() {
    // render
    const str = this.TEMPLATES["Advice"](this.api);
    this.$advice.html(str);

    // unhighlight active assumption/question
    this._setAssumptionActive("advice");
  }

  /**
   * Map data from API for this showcase's handlebars templates
   */
  mapData() {
    // setup "display" card — either question or "advice".
    // `api.advice` is an array of every input + advice node
    this.api.display = _.last(this.api.advice) || {};
    // build collection of just answers & assumptions
    this.api.answers = this.api.advice.filter(a => { return a.type == "INPUT_REQUEST"; }).map((a, i) => {
      a.idx = i;
      return a;
    });

    // remove last item, it's always an unanswered question
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.answers.pop();
    }

    // assumptions are grouped, answers are not
    const ASSUMPTIONS_UNGROUPED = "ungrouped";
    this.api.assumptions = _.groupBy(this.api.answers, (a) => {
      return (a.tagGroup) ? a.tagGroup.name : ASSUMPTIONS_UNGROUPED;
    });

    // go through each assumption group and set open/close state
    Object.keys(this.api.assumptions).forEach((key, idx) => {
      if (key == ASSUMPTIONS_UNGROUPED) { return; }

      // add `_isOpen` flag to each item
      const arr = this.api.assumptions[key];
      this.api.assumptions[key] = arr.map(a => {
        a._isOpen = store.get(`assumption_${a.tagGroup.id}_${this.api.adviceset.id}`, false);
        return a;
      });
    });

    const allAdvice = this.mapAdviceData();

    // group all advice into bucketed recommendations
    this.api.recommendations = _.groupBy(allAdvice, (a) => { return (a.tagGroup) ? a.tagGroup.name : "Recommendations"; });
    // add icon
    Object.keys(this.api.recommendations).forEach((key, idx) => {
      // add icons
      // eslint-disable-next-line complexity
      this.api.recommendations[key] = this.api.recommendations[key].map(a => {
        // determine if this is an interactive chart attachment
        const { attachment } = a;
        let isChart = false;
        if (attachment) {
          isChart = attachment.contentType == "application/vnd+interactive.chart+html";
          // handlebars helper
          attachment._isInteractiveChart = isChart;
        }

        let icon = "fad fa-arrow-circle-right";
        if (this.isTaffrail && a.summary && isChart) {
          icon = "fal fa-chevron-down";
        } else if (this.isTaffrail && a.summary) {
          icon = "fal fa-chevron-right";
        } else if (this.isTaffrail){
          icon = "fal fa-chevron-circle-right invisible-bullet";
        }
        // support To Do/Completed checklist icons
        if (key.includes("To Do")) {
          icon = "fad fa-circle";
        } else if (key.includes("Completed") || key.includes("Accomplishments")) {
          icon = "fad fa-check-circle";
        }
        // save the helper for handlebars
        a._icon = icon;

        return a;
      });
    });
  }

  /**
   * Slight speed update to cache frequently-used templates and selectors
   */
  initCache() {
    // cache element selectors
    this.$advice = $(".advice");
    // cache templates
    this.TEMPLATES = {
      "AdviceSetDetails": Handlebars.compile($("#tmpl_adviceSetDetails").html()),
      "InputRequest": Handlebars.compile($("#tmpl_adviceInputRequest").html()),
      "Advice": Handlebars.compile($("#tmpl_adviceAdvice").html()),
      "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      "Variables": Handlebars.compile($("#tmpl_variablesList").html()),
      "Assumptions": Handlebars.compile($("#tmpl_assumptionsList").html()),
      "QuestionsAnswers": Handlebars.compile($("#tmpl_answersList").html()),
    };
  }
  // #endregion

  /**
	 * Update Advice Set details (left side)
	 */
  updateAdviceSetDetails(){
    // render
    const str = this.TEMPLATES["AdviceSetDetails"](this.api);
    $(".advice-set-details").html(str);
  }

  /**
	 * Update assumptions/answers/history list
	 */
  updateAssumptionsList(){
    // do we have ANY assumptions/answers yet?
    // show or hide depending
    // simple helper for UX
    this.api._answersExist = this.api.answers.length > 0;
    $(".assumptions-container").toggle(this.api._answersExist);
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
    this.api._referenceDocumentsExist = this.api._recommendationsExist && this.api.adviceset.referenceDocuments.length > 0;

    // render
    const str = this.TEMPLATES["Recommendations"](this.api);
    $(".list-all-recommendations").html(str);

    this._setupChartsAll();
  }

  /**
   * Change the highlighted assumption in the list based on
   * active display.
   */
  _setAssumptionActive(isAdvice){
    const { id } = this.api.display;
    if (isAdvice) {
      $(".assumptions, .answers").find("li").removeClass("active");
    } else {
      $(".assumptions, .answers").find("li").removeClass("active").end().find(`li[data-id=${id}]`).addClass("active");
    }
  }

  /**
	 * Update variables list
	 */
  updateVariablesList(){
    // render
    const str = this.TEMPLATES["Variables"](this.api);
    $(".variables").html(str);
  }
  // #endregion

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
      const containerW = $chart.parents(".advice-group").outerWidth();
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
          colors: this.isTaffrail ? ["#023E7D", "#0466C8"] : ["#605F5E", "#6D256C"],
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
    _.flatMap(this.api.recommendations).filter(a => {
      return a.attachment && a.attachment._isInteractiveChart;
    }).map(a => {
      return a.attachment;
    }).forEach(chart => {
      setTimeout(() => {
        this.setupChart(true, chart.id);
      }, 500);
    });
  }

  /**
   *
   * @param {jquery} $el Click target
   * @param {boolean} shown Open or closed?
   */
  _toggleCollapseLink($el, shown) {
    $el.find("span").text( shown ? "Collapse" : "Expand");
    $el.find("i").addClass( shown ? "fa-minus-square" : "fa-plus-square").removeClass( !shown ? "fa-minus-square" : "fa-plus-square");
    $el.data("collapsed", !shown);
  }
  // #endregion
}