App = {
  init: function(opt){
    opt = opt || {};
    this.bcGraph = BcGraph(opt.bcGraphId);

    this.bcGraph.onNodeSelected = function(data){
      Session.set("nodeData", data);
    };

    this.bcGraph.showBlock("latest");
    this.bcGraph.fetch("latest");
  }
};
