import _ from "lodash";

class AjaxLoading {
  /**
   * Show a mask + loader over a container to indicate loading
   * @param {jQuery} $container jQuery container element
   * @param {string=} ajaxId Unique ID for spinner
   */
  static show($container, ajaxId = _.uniqueId("loading")) {
    const imgWH = 44;
    let imgPath = "/img/Rainbow-1s-200px.svg";
    if (location.pathname.includes("deck")){
      imgPath = "/img/Wave-1s-200px.svg";
    }

    if ($(`#loader_${ajaxId}`).length) {
      this.hideAjaxLoader(ajaxId);
    }

    const height = $container.outerHeight();
    const width = $container.outerWidth();
    const containerPosition = $container.offset();
    const imageTopPosition = containerPosition.top + ((height - imgWH) / 2); // center loader vertically
    const imageLeftPosition = containerPosition.left + ((width - imgWH) / 2); // center horizontally

    // attach mask
    $("<div />")
      .attr("id", `loader_${ajaxId}`)
      .addClass("loading-mask")
      .css({
        top: containerPosition.top,
        left: containerPosition.left,
        height: height,
        width: width
      })
      .appendTo("body")
    ;

    // attach spinner
    $(`<img src="${imgPath}" />`)
      .attr({
        id: `loader_spinner_${ajaxId}`,
        height: imgWH,
        width: imgWH
      })
      .addClass("loading-spinner")
      .css({
        height: imgWH,
        left: imageLeftPosition,
        top: imageTopPosition,
        width: imgWH
      })
      .appendTo("body")
    ;

    return ajaxId;
  }

  /**
   * Remove mask + loader over a container to indicate loading
   * @param {string} ajaxId ID of spinner to remove
   */
  static hide(ajaxId){
    $(`#loader_spinner_${ajaxId}`).remove();
    $(`#loader_${ajaxId}`).remove();
  }
}

export default AjaxLoading;