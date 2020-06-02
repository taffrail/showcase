/* eslint-disable new-cap */
import _ from "lodash";
import { createBrowserHistory } from "history";
import copy from "clipboard-copy";
import Inputmask from "inputmask";
import Handlebars from "handlebars";
import Loading from "./loading";
import Mousetrap from "mousetrap";
import qs from "querystring";
import store from "store";

export default class showcaseMobile {
  constructor() {
    this.history = createBrowserHistory();

    // handlebars helpers
    Handlebars.registerHelper("ifEquals", function(arg1, arg2, options) {
      return (arg1=== arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("ifNotEquals", function(arg1, arg2, options) {
      return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });
  }

  // #region getter/setter
  get api() {
    return window.jga.api;
  }

  set api(data) {
    window.jga.api = data;
    return data;
  }

  get config() {
    return window.jga.config;
  }

  get baseUrl() {
    return `/s/${this.api.adviceset.id}/mobile`;
  }

  set windowTitle(title) {
    document.title = title;
  }
  // #endregion

  /**
   * One-time initialization
   */
  init() {
    this.initCache();
    this.updateAdviceSetDetails();
    this.updatePanes();

    // on page load, save current state
    this.history.replace(`${this.baseUrl}/${location.search}`, this.api);

    // events
    this.handleClickSheet();
    this.handleClickToggleUx();
    this.handleClickContinue();
    this.handleClickBack();
    this.handleClickAssumption();
    this.handleCollapseAssumptionGroup();
    this.listenForUrlChanges();
    this.handleClickExpandControls();
    this.handleCopyLink();
    $("body").tooltip({ selector: "[data-toggle=tooltip]" });

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
        message: "Press <code>a</code> for advice.<br>Press <code>s</code> for assumptions.",
        delay: 5000
      });
    });
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes(){
    this.mapData();
    this.updateMainPane();
    this.updateAssumptionsList();
    this.updateRecommendationsList();
    this._scrollChatBubbles();
  }

  // #region event handlers
  /**
   * Open/close a sheet
   */
  handleClickSheet() {
    $(".screen").on("click", "a[data-sheet]", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      const { sheet } = $el.data();
      $el.tooltip("hide");
      if (sheet == "assumptions") {
        $("#sheet_assumptions").toggleClass("show");
      }
    });
  }

  /**
   * Handle click on tabbar chat icon to change to Virtual Assistant style
   */
  handleClickToggleUx() {
    $(".tabbar").on("click", ".ux-app", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      $el.tooltip("hide");
      const { uxmode = "app" } = $el.data();
      if (uxmode == "app") {
        $el.data("uxmode", "asst");
        $el.find("i").removeClass("fa-comment-lines").addClass("fa-comments-alt");
        $("body").addClass("uxmode-asst").removeClass("uxmode-app");
        this._scrollChatBubbles();
      } else {
        $el.data("uxmode", "app");
        $el.find("i").addClass("fa-comment-lines").removeClass("fa-comments-alt");
        $("body").addClass("uxmode-app").removeClass("uxmode-asst");
        this._scrollChatBubbles();
      }
    });
  }

  /**
   * "Next" button handler
   */
  handleClickContinue() {
    // pressing radio button auto-advances to next
    this.$advice.on("click", ".form-check label.form-check-label", e => {
      const $lbl = $(e.currentTarget);
      $lbl.prev("input").prop("checked", true);
      const $form = $lbl.closest("form");
      $form.submit();
    });

    this.$advice.on("submit", "form", e => {
      const $form = $(e.currentTarget);

      this._scrollTop();

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

      this._loadApi(data).then(()=> {
      // update content
        this.updatePanes();
        // save state
        this.history.push(`${this.baseUrl}/?${this.api.adviceset._apiUrlQuery}`, this.api);
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
      this._scrollTop();
      // temp override `display` global prop to insert question into HTML
      this.api.display = display;
      this.updateMainPane();
    });
  }

  /**
   * Click handler for assumptions or Q&A
   */
  handleClickAssumption() {
    $(".answers-chat-bubbles, .assumptions").on("click", ".a > a", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      this._scrollTop();
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const assumption = _.flatMap(this.api.assumptions).find((a) => { return a.idx == data.idx; });
      this.api.display = assumption;
      this.api.display.idx = assumption.idx;
      if ($this.parents(".answers-chat-bubbles").length) {
        console.log(this.api.display)
        const $bubbles = $(".answers-chat-bubbles").find(`li[data-id=${this.api.display.id}]`);
        $bubbles.hide();
        $bubbles.after(`<aside class="changing" id="change_bubble_${this.api.display.id}"></aside>`)
        this._updateForInputRequest($(`#change_bubble_${this.api.display.id}`));
      } else {
        $("a[data-sheet=assumptions]").first().click();
        setTimeout(() => {
          this.updateMainPane();
        }, 300);
      }
    });
  }

  /**
   * Listener for pening/closing assumption groups
   */
  handleCollapseAssumptionGroup() {
    $(".assumptions").on("show.bs.collapse", "ol.assumptions-list.collapse", (e) => {
      const $this = $(e.currentTarget);
      const { groupId } = $this.find("li").first().data();
      store.set(`assumption_${groupId}_${this.api.adviceset.id}`, true);
      const $toggler = $(`a[aria-controls=${$this.prop("id")}]`);
      $toggler.find("i").addClass("fa-chevron-down").removeClass("fa-chevron-right");
    });

    $(".assumptions").on("hide.bs.collapse", "ol.assumptions-list.collapse", (e) => {
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
        $("#pills-assumptions-tab").click();
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
   * Handle click to generate and copy a short URL
   */
  handleCopyLink() {
    $("body").on("click", "a.copy-url", e => {
      e.preventDefault();
      const linkGenId = _.uniqueId("link-gen");
      const url = window.location.href;

      // we can't shorten localhost links
      if (url.includes("localhost")) {
        return copy(url).then(() => {
          this.showToast(linkGenId, {
            title: "Just Good Advice",
            message: "Link copied!"
          });
        });
      }

      // hit the shorten API
      const { display } = this.api;
      const title = display.type == "INPUT_REQUEST" ? display.question : display.headline;

      $.post("/s/api/shorten", {
        long_url: url,
        title: `${this.api.adviceset.title} - ${title}`
      }).then(bitly => {
        // copy to clipboard
        return copy(bitly.link).then(() => {
          this.showToast(linkGenId, {
            title: "Just Good Advice",
            message: "Link copied!"
          });
        });
      }).catch(e => {
        console.error(e);
        this.showToast(linkGenId, {
          title: "Oops",
          message: "Link copying error."
        });
      })
    });
  }

  /**
   * Listen on the browser history for POP actions to update the page.
   */
  listenForUrlChanges() {
    this.history.listen((location, action) => {
      if (action === "POP" && location.state) {
        this.api = location.state;
        this.updatePanes();
      }
    });
  }
  // #endregion

  // #region data
  /**
   * Capture new form data, merge with current state and make new Advice API request.
   * @param {object} newFormData Form data from input request.
   * @returns Promise<jqXHR>
   */
  _loadApi(newFormData){
    // pull querystring from API URL (which has latest passed data)
    const currFormData = qs.parse(this.api.adviceset._apiUrlQuery);
    const formData = _.assign({ include: ["filteredVars"], showcase: true }, currFormData, qs.parse(newFormData));
    const [apiUrlWithoutQuerystring] = this.api.adviceset.apiUrl.split("?");
    const loadingId = Loading.show($("main.screen"));

    return $.ajax({
      url: apiUrlWithoutQuerystring,
      type: "GET",
      dataType: "json",
      headers: {
        "Accept": "application/json; chartset=utf-8",
        "Authorization": `Bearer ${this.config.api_key}`
      },
      data: formData
    }).then(api => {
      // update global!
      this.api = api.data;
      Loading.hide(loadingId);
      return api;
    }).catch((jqXHR) => {
      let err;
      try {
        err = jqXHR.responseJSON.error.message;
      } catch (e){
        err = jqXHR;
      }
      alert(err);
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
    if (this.api.display.type == "INPUT_REQUEST") {
      $(".advice").slideDown(300);
      this._updateForInputRequest();
    } else {
      // must be advice
      if (this.api.display._isLast) {
        // since it's "last", hide the question.
        $(".advice").slideUp(300);
      }
    }
  }

  // #region templating utils
  /**
   * Template update for INPUT_REQUEST
   */
  _updateForInputRequest($container = this.$advice) {
    // render
    const str = this.TEMPLATES["InputRequest"](this.api);
    $container.html(str);

    // hide "next" button unless it's a numeric input
    const isRadio = this.api.display.form.fieldType.match(/Radio|Boolean/);
    $container.find("button[type=submit]").toggle(!(isRadio && isRadio.length > 0));

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
   * Map data from API for this showcase's handlebars templates
   */
  mapData() {
    // setup "display" card — either question or "advice".
    // `api.advice` is an array of every input + advice node
    this.api.display = _.last(this.api.advice) || {};
    // build collection of just answers/assumptions
    this.api.answers = this.api.advice.filter(a => { return a.type == "INPUT_REQUEST"; }).map((a, i) => {
      a.idx = i;
      return a;
    });

    // remove last item, it's always an unanswered question
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.answers = this.api.answers.slice(0, -1);
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

    // if the `display` is the LAST advice node, set a flag
    const allAdvice = this.api.advice.filter(a => { return a.type == "ADVICE"; });
    const lastAdvice = _.last(allAdvice);
    if (lastAdvice && this.api.display.id == lastAdvice.id) {
      // allAdvice = allAdvice.slice(0, -1);
      lastAdvice._isLast = true;
    }

    // group all advice into bucketed recommendations
    this.api.recommendations = _.groupBy(allAdvice, (a) => { return (a.tagGroup) ? a.tagGroup.name : "Recommendations"; });
    // add icon
    Object.keys(this.api.recommendations).forEach((key, idx) => {
      // add icons
      this.api.recommendations[key] = this.api.recommendations[key].map(a => {
        // use thumbs up icon by default
        // let icon = "fal fa-thumbs-up";
        let icon = "fal fa-arrow-circle-right";
        // support To Do/Completed checklist icons
        if (key.includes("To Do")) {
          icon = "fal fa-circle";
        } else if (key.includes("Completed") || key.includes("Accomplishments")) {
          icon = "fal fa-check-circle";
        }
        // save the helper for handlebars
        a._icon = icon;

        // determine if this is an interactive chart attachment
        const { attachment } = a;
        let isChart = false;
        if (attachment) {
          isChart = attachment.contentType == "application/vnd+interactive.chart+html";
          // handlebars helper
          attachment._isInteractiveChart = isChart;
        }

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
      "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      "Assumptions": Handlebars.compile($("#tmpl_assumptionsList").html()),
      "AnswerChatBubbles": Handlebars.compile($("#tmpl_answersList").html()),
    };
  }

  /**
   * Set an index on the `display` to allow navigating assumptions list
   */
  _setCurrentIdx() {
    // set the current index based on answers
    // only useful for going "back"
    let currIdx = _.findIndex(this.api.answers, (ans) => { return this.api.display.id == ans.id });
    if (currIdx == -1) {
      currIdx = this.api.answers.length;
    }
    this.api.display._currIdx = currIdx;
    this.api.display._isFirst = currIdx === 0;
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

    // render
    const strAssump = this.TEMPLATES["Assumptions"](this.api);
    $(".assumptions").html(strAssump);

    const str = this.TEMPLATES["AnswerChatBubbles"](this.api);
    $(".answers-chat-bubbles").html(str);
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
  // #endregion

  // #region form utils
  /**
	 * Set the form value from the API data
	 */
  _setValue() {
    const { display: { form: { fieldType, result } } } = this.api;
    let { value } = result;
    if (!value || value == "\"null\"") { return; }

    const $formEls = this.$advice.find("form").find("input,select");
    $formEls.each((i, el) => {
      const $el = $(el);
      if ($el.is(":radio")) {
        if ($el.prop("value") == value || $el.prop("value") == "\""+value+"\"") {
          $el.prop("checked", true)
        }
      } else {
        // precision-to-display
        if (fieldType == "Percent") {
          value = value * 100;
        }
        $el.val(value);
      }
    });
  }

  /**
   * Setup form input masks based on type
   * https://github.com/RobinHerbots/Inputmask#mask
   */
  // eslint-disable-next-line complexity
  _handleInputMasks(){
    const $inputEl = this._findFormInput(this.$advice.find("form"));
    if ($inputEl.length) {
      const maskOpts = {
        showMaskOnHover: false
      };
      const { fieldType, properties } = this.api.display.form;
      const { range = {} } = properties;
      let { format: formatStr = "" } = properties;

      // if min & max attrs are present, pass them to the mask
      const { min, max } = range;
      if (min !== "undefined") {
        $inputEl.prop("min", min);
        maskOpts.min = min;
      }
      if (max !== "undefined") {
        $inputEl.prop("max", max);
        maskOpts.max = max;
      }

      // coerce to string for conditional test below
      formatStr = String(formatStr);

      // https://github.com/RobinHerbots/Inputmask/blob/4.x/README_numeric.md#aliases
      // https://github.com/RobinHerbots/Inputmask/blob/5.x/lib/extensions/inputmask.numeric.extensions.js#L442
      switch (fieldType) {
        case "Number":
          maskOpts.alias = "numeric";
          maskOpts.showMaskOnFocus = false;

          // check format to see if we need a different mask
          if (formatStr.includes("$")) {
            maskOpts.alias = "currency";
            maskOpts.digitsOptional = true;
            maskOpts.prefix = "$ ";
            maskOpts.showMaskOnFocus = true;
          }
          break;
        case "Percent":
          maskOpts.alias = "percentage";
          // Get the number of decimal points if decimal is present
          if (formatStr.indexOf(".") != -1){
            maskOpts.digits = formatStr.indexOf("%") - formatStr.indexOf(".") - 1;
          }
          break;
        case "Date":
          maskOpts.alias = "datetime";
          break;
      }

      if (maskOpts.mask || maskOpts.alias) {
        const im = new Inputmask(maskOpts).mask($inputEl.get(0));
        $inputEl.data("inputmask", im);
      }
    }
  }

  /**
	 * Focus the 1st visible input on the question form for quicker UX.
	 */
  _focusFirstInput() {
    // focus 1st input
    this._findFormInput(this.$advice.find("form"), "input,textarea,select").first().focus();
  }

  /**
   * Find input element
   * @param {jquery} $form Form element
   * @param {string=} types Comma-separated list of HTML tags, e.g., "input,select"
   */
  _findFormInput($form, types = "input") {
    return $form.find(types).filter(":not(:radio):not(:hidden)");
  }

  /**
   * Sets up chart
   * @param {boolean} isChart
   */
  setupChart(isChart, chartId) {
    // setup the chart...
    if (isChart) {
      const $chart = $(`[data-id=${chartId}]`);
      if (!$chart.length) { return; }
      const { src } = $chart.data();
      // parent container
      const containerW = $chart.parents(".list-all-recommendations").outerWidth();
      const $iframe = $chart.find("iframe");
      // set chart container size
      $chart.css({
        height: 350,
        width: containerW
      });

      $iframe.on("load", e => {
        // specific data chart is expecting
        // TODO: clean this up in the chart code
        window.jga.config = {
          adviceSetId: this.api.adviceset.id,
          bgColor: "#fff",
          colors: ["#605F5E", "#0B5D1E"],
          width: containerW,
          height: 350
        }
        window.jga.advice = {
          session: Object.assign({
            ruleSetId: this.api.adviceset._id,
            ruleId: this.api.display.ruleId,
          }, qs.parse(this.api.adviceset._apiUrlQuery))
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

  /**
   * Helper to scroll to bottom of chat
   */
  _scrollChatBubbles() {
    if ($("body").hasClass("uxmode-asst")) {
      let top = $(".screen").get(0).scrollHeight;
      if (this.api.display.type == "ADVICE") {
        ({ top } = $(".screen").find(".list-all-recommendations").position());

      }
      setTimeout(() => {
        $(".screen").animate({ scrollTop: top });
      }, 300);
    } else {
      // move phone screen to top
      $(".screen").animate({ scrollTop: 0 });
    }
  }

  /**
   * Helper to scroll to top
   */
  _scrollTop() {
    // 80 = height of banner
    const top = $(".phone").offset().top - 90;
    $("html, body").animate({ scrollTop: top });
  }

  /**
   *
   * @param {string=} id Optional ID
   * @param {object} opts Toast options
   */
  showToast(id = _.uniqueId("toast"), opts = {}) {
    if (!opts.id) {
      opts.id = id;
    }
    const toast = Handlebars.compile($("#tmpl_toast").html())(opts);
    // insert into DOM
    $("#toastContainer").append(toast);
    // init Toast component
    $(`#${id}`).toast({
      delay: opts.delay || 2000
    }).on("hidden.bs.toast", function() {
      $(this).remove(); // remove it when it's been hidden
    }).toast("show"); // finally show it
  }
  // #endregion
}