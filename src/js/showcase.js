import Mustache from "mustache";

export default class showcase {
  constructor() {
    // showcase
    console.log("showcase");
  }

  get api() {
    return window.jga.api;
  }

  set api(data) {
    window.jga.api = data;
    return data;
  }

  init() {
    this.updateMainPane();
    this.updateAdviceSetDetails();
    this.updateVariablesList();
  }

  /**
	 * Update center Advice/Question pane
	 */
  updateMainPane(){
    // render
    let str;
    if (this.api.display.type == "INPUT_REQUEST") {
      str = Mustache.render($("#tmpl_adviceInputRequest").html(), this.api.display);
    } else {
      str = Mustache.render($("#tmpl_adviceAdvice").html(), this.api.display);
    }
    $(".advice").html(str);
  }

  /**
	 * Update Advice Set details (left side)
	 */
  updateAdviceSetDetails(){
    // strip off first 2 chars
    this.api.advice.id = this.api.advice.id.slice(2);
    // render
    const str = Mustache.render($("#tmpl_adviceSetDetails").html(), this.api);
    $(".advice-set-details").html(str);
  }

  /**
	 * Update variables list (right side)
	 */
  updateVariablesList(){
    // filter variable list
    this.api.variables = this.api.variables.filter(v => {
      return v.value !== null // remove all vars that do not have a value
						&& !v.isSystem // remove all system vars
						&& !v.isConstant // remove all constant vars
						&& /rule_.*?_selection/.exec(v.name) === null // remove all rule_?_section vars
    });
    // render
    const str = Mustache.render($("#tmpl_variablesList").html(), this.api);
    $(".variables").html(str);
  }
}