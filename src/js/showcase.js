import _ from "lodash";
import { createBrowserHistory } from "history";
import Loading from "./loading";
import Mustache from "mustache";
import qs from "querystring";
import numeral from "numeral";

const history = createBrowserHistory();

export default class showcase {
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
    return `/s/${this.api.advice.id}`;
  }

  set windowTitle(title) {
    document.title = title;
  }

  init() {
    this.updateAdviceSetDetails();
    this.updatePanes();
    // on page load, save current state
    history.replace(`${this.baseUrl}/${location.search}`, this.api);

    // events
    this.handleClickOk();
    this.handleClickQuesAns();
    this.handleClickOpenDebug();
    this.listenForUrlChanges();
    $("body").tooltip({ selector: "[data-toggle=tooltip]" });
  }

  /**
   *
   */
  updatePanes(){
    this.updateMainPane();
    this.updateAnswersList();
    this.updateVariablesList();
  }

  handleClickOk() {
    $(".advice").on("submit", "form", e => {
      const $form = $(e.currentTarget);

      this._loadApi($form.serialize()).then(()=> {
        // update content
        this.updatePanes();
        // pull querystring from API URL (which has latest passed data)
        const queryString = this.getQuerystringFromUrl(this.api.advice.apiUrl);
        // save state
        history.push(`${this.baseUrl}/?${queryString}`, this.api);
      });

      return false; // don't submit form
    });
  }

  handleClickQuesAns() {
    $(".answers, .answersByVariable").on("click", ".a > a", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      this.api.display = this.api.answers.find((a) => { return a.idx == data.idx; }).expand;
      this.updateMainPane();
    });
  }

  handleClickOpenDebug() {
    $(".advice").on("click", "[data-action=openDebugWithQuerystring]", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const url = $this.prop("href");
      const queryString = this.getQuerystringFromUrl(this.api.advice.apiUrl);
      window.open(`${url}?${queryString}`);
    });
  }

  listenForUrlChanges() {
    history.listen((location, action) => {
      if (action === "POP" && location.state) {
        this.api = location.state;
        this.updatePanes();
      }
    });
  }

  _loadApi(newFormData){
    // pull querystring from API URL (which has latest passed data)
    const currFormData = qs.parse(this.getQuerystringFromUrl(this.api.advice.apiUrl));
    const formData = _.assign({}, currFormData, qs.parse(newFormData));
    const [apiUrlWithoutQuerystring] = this.api.advice.apiUrl.split("?");
    const loadingId = Loading.show($(".row.no-gutters .advice"));

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
      // update global
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

  /**
	 * Update center Advice/Question pane
	 */
  updateMainPane(){
    // update the window title
    this.windowTitle = `${this.api.advice.title} - ${this.api.advice.owner.name}`;

    // render
    let str;
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.display.form.fieldType_isRadio = this.api.display.form.fieldType == "Radio";
      this.api.display.form.fieldType_isBoolean = this.api.display.form.fieldType == "Boolean";
      this.api.display.form.fieldType_isFreetext = this.api.display.form.fieldType == "Freetext";
      this.api.display.form.fieldType_isMultipleChoice = this.api.display.form.fieldType == "MultipleChoice";
      this.api.display.form.fieldType_isNumber = this.api.display.form.fieldType == "Number";
      this.api.display.form.fieldType_isPercent = this.api.display.form.fieldType == "Percent";
      this.api.display.form.fieldType_isSelect = this.api.display.form.fieldType == "Select";

      str = Mustache.render($("#tmpl_adviceInputRequest").html(), this.api);
      $(".advice").html(str);
      // set value
      this._setValue();
      // focus input
      this._focusFirstInput();
    } else {
      const isUnreachable = this.api.display.id === "-32768";
      if (isUnreachable){
        this.api.display = Object.assign(this.api.display, {
          headline: "Advice Engine Response",
          summary: "This rule has been evaluated, see variable data for export."
        });
      }
      str = Mustache.render($("#tmpl_adviceAdvice").html(), this.api);
      $(".advice").html(str);
    }

    this.updateRecommendationsList();
  }

  /**
	 * Update Advice Set details (left side)
	 */
  updateAdviceSetDetails(){
    // render
    const str = Mustache.render($("#tmpl_adviceSetDetails").html(), this.api);
    $(".advice-set-details").html(str);
  }

  /**
	 * Update answers/history list (right side)
	 */
  updateAnswersList(){
    // render
    const str = Mustache.render($("#tmpl_answersList").html(), this.api);
    const strVar = Mustache.render($("#tmpl_answersListByVariable").html(), this.api);
    $(".answers").html(str);
    $(".answersByVariable").html(strVar);
  }

  /**
	 *
	 */
  updateRecommendationsList() {
    // simple helper for UX
    this.api._recommendationsExist = _.flatMap(this.api.recommendations).length > 0;

    // render
    const str = Mustache.render($("#tmpl_recommendationsAdviceList").html(), this.api);
    $(".recommendationsContainer").html(str);
  }

  /**
	 * Update variables list (right side)
	 */
  updateVariablesList(){
    // add formatted value to vars
    this.api.variables = this.api.variables.map(v => {
      if (v.format) {
        v.valueF = numeral(v.value).format(v.format);
      }
      return v;
    });
    // render
    const str = Mustache.render($("#tmpl_variablesList").html(), this.api);
    $(".variables").html(str);
  }

  /**
	 *
	 */
  _setValue() {
    const { value } = this.api.display.form.result;
    if (!value || value == "\"null\"") { return; }

    const $formEls = $(".advice form").find("input,select");
    $formEls.each((i, el) => {
      const $el = $(el);
      if ($el.is(":radio")) {
        if ($el.prop("value") == value || $el.prop("value") == "\""+value+"\"") {
          $el.prop("checked", true)
        }
      } else {
        $el.val(value);
      }
    });
  }

  /**
	 *
	 */
  _focusFirstInput() {
    // focus 1st input
    $(".advice form").find("input:not(:radio),textarea,select").filter(":visible").first().focus();
  }

  /**
	 *
	 */
  getQuerystringFromUrl(url) {
    return url.substring(url.indexOf("?") + 1);
  }
}