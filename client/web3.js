Meteor.startup(function(){
  web3.setProvider(new web3.providers.HttpProvider(Meteor.settings.public.rpcAddress));  
});



