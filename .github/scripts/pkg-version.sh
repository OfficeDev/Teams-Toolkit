#!/bin/bash
if [ $1 == 'templates' ]; then
    if [[ $SkipSyncup == *"template"* ]]; then
        echo "skip sync up templates version with sdk version"
    elif [[ -z "$(git diff -- ../../templates)" ]]; then
    echo "need bump up templates version since templates don not bump up by self"
    node ../../.github/scripts/sdk-sync-up-version.js yes;
    else 
    echo "no need to bump up templates version"
    node ../../.github/scripts/sdk-sync-up-version.js 
    fi
    git add ../../templates
elif [ $1 == 'fx-core' ]; then
    if [[ -z "$(git diff -- ../fx-core)" ]]; then
    echo "need bump up fx-core version since fx-core don not bump up by self"
    node ../../.github/scripts/update-simpleauth-ver.js yes;
    else 
    echo "no need to bump up templates version"
    node ../../.github/scripts/update-simpleauth-ver.js 
    fi
    git add ../fx-core
elif [ $1 == 'function-extension' ]; then   
    if [[ -z "$(git diff -- ../../templates)" ]]; then
    echo "need bump up tempaltes version since templates do not bump up by self"
    node ../../.github/scripts/update-extension-ver.js yes
    else 
    echo "no need to bump up templates version"
    node ../../.github/scripts/update-extension-ver.js
    fi
    git add ../../templates
fi