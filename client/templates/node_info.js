var _ = lodash;

Template.nodeInfo.helpers({
  node: function(){
    return Session.get("nodeData");
  },
  fields: function(){
    return  _(Session.get("nodeData")).omit("type").map(function(val,key){
      return {
        key: key,
        value: val,
        list: _.isArray(val)
      };
    }).sortBy("key").value();
  },
  type: function(){
    return Session.get("nodeData").type;
  }
});
