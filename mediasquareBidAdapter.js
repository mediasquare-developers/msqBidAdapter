import * as utils from 'src/utils';
import {ajax} from '../src/ajax.js';
import {config} from 'src/config';
import {registerBidder} from 'src/adapters/bidderFactory';
import {BANNER, VIDEO} from '../src/mediaTypes';

const BIDDER_CODE = 'mediasquare';
const BIDDER_URL_PROD = 'https://bidder.mediasquare.fr/'
const BIDDER_URL_TEST = 'https://bidder-test.mediasquare.fr/'
const BIDDER_ENDPOINT_AUCTION = 'msq_prebid';
const BIDDER_ENDPOINT_SYNC = 'cookie_sync';
const BIDDER_ENDPOINT_WINNING = 'winning';

const BIDDER_ENDPOINT = 'https://bidder.mediasquare.fr/msq_prebid';
const SYNC_ENDPOINT = 'https://bidder.mediasquare.fr/cookie_sync';
const WINNING_ENDPOINT = 'https://bidder.mediasquare.fr/winning';

export const spec = {
        code: BIDDER_CODE,
        aliases: ['msq'], // short code
		supportedMediaTypes: [BANNER],
        /**
         * Determines whether or not the given bid request is valid.
         *
         * @param {BidRequest} bid The bid params to validate.
         * @return boolean True if this is a valid bid, and false otherwise.
         */
        isBidRequestValid: function(bid) {
            return !!(bid.params.owner || bid.params.code);
        },
        /**
         * Make a server request from the list of BidRequests.
         *
         * @param {validBidRequests[]} - an array of bids
         * @return ServerRequest Info describing the request to the server.
         */
        buildRequests: function(validBidRequests, bidderRequest) {
            let codes = [];
            let endpoint = document.location.search.match(/msq_test=true/) ? BIDDER_URL_TEST : BIDDER_URL_PROD;
            const test = config.getConfig('debug') ? 1 : 0;
            for (let [adunit_index, adunit_value] of Object.entries(validBidRequests))
                codes.push({
                    owner: adunit_value.params.owner,
                    code: adunit_value.params.code,
                    adunit: adunit_value.adUnitCode,
                    bidId: adunit_value.bidId,
                    auctionId: adunit_value.auctionId,
                    transactionId: adunit_value.transactionId,
                    mediatypes: adunit_value.mediaTypes
                });
            const payload = {
                codes: codes,
                referer: encodeURIComponent(bidderRequest.refererInfo.referer)
                //schain: validBidRequests.schain,
            };
            if (bidderRequest && bidderRequest.gdprConsent) {
                payload.gdpr = {
                    consent_string: bidderRequest.gdprConsent.consentString,
                    consent_required: bidderRequest.gdprConsent.gdprApplies
                };
            };
            if (test)
		payload.debug = true;
            const payloadString = JSON.stringify(payload);
            return {
                method: 'POST',
                url: endpoint + BIDDER_ENDPOINT_AUCTION,
                data: payloadString,
            };
        },
        /**
         * Unpack the response from the server into a list of bids.
         *
         * @param {ServerResponse} serverResponse A successful response from the server.
         * @return {Bid[]} An array of bids which were nested inside the server.
         */
        interpretResponse: function(serverResponse, bidRequest) {
            const serverBody  = serverResponse.body;
            // const headerValue = serverResponse.headers.get('some-response-header');
            const bidResponses = [];
			let bidResponse = null;
			if (serverBody.hasOwnProperty('responses')) 
				for (let [index, value] of Object.entries(serverBody['responses'])) {
					//if (bidRequest.bidId == value['transaction_id']) {
						bidResponse = {
							requestId: value['bid_id'],
							cpm: value['cpm'],
							width: value['width'],
							height: value['height'],
							creativeId: value['creative_id'],
							currency: value['currency'],
							netRevenue: value['net_revenue'],
							ttl: value['ttl'],
							ad: value['ad'],
							mediasquare: {
								'bidder': value['bidder'],
								'code': value['code']
							}
						};
						if (value.hasOwnProperty('deal_id')) 
							bidResponse['dealId'] = value['deal_id'];
						bidResponses.push(bidResponse);
					//};
				}
			return bidResponses;
    },

    /**
     * Register the user sync pixels which should be dropped after the auction.
     *
     * @param {SyncOptions} syncOptions Which user syncs are allowed?
     * @param {ServerResponse[]} serverResponses List of server's responses.
     * @return {UserSync[]} The user syncs which should be dropped.
     */
    getUserSyncs: function(syncOptions, serverResponses, gdprConsent) {
        let params = '';
        let endpoint = document.location.search.match(/msq_test=true/) ? BIDDER_URL_TEST : BIDDER_URL_PROD;
        if (gdprConsent && typeof gdprConsent.consentString === 'string') 
            if (typeof gdprConsent.gdprApplies === 'boolean')
                params += `&gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${gdprConsent.consentString}`;
            else
                params += `&gdpr_consent=${gdprConsent.consentString}`;
        if (syncOptions.iframeEnabled) {
            return {
                type: 'iframe',
                url: endpoint + BIDDER_ENDPOINT_SYNC + '?type=iframe'+ params
            };
        }
        if (syncOptions.pixelEnabled) {
            return {
                type: 'image',
                url: endpoint + BIDDER_ENDPOINT_SYNC + '?type=pixel'+ params
            };
        }
    },

    /**
     * Register bidder specific code, which will execute if bidder timed out after an auction
     * @param {data} Containing timeout specific data
     */
    onTimeout: function(data) {
        // Bidder specifc code
    },

    /**
     * Register bidder specific code, which will execute if a bid from this bidder won the auction
     * @param {Bid} The bid that won the auction
     */
    onBidWon: function(bid) {
        // fires a pixel to confirm a winning bid
		let params = [];
		let endpoint = document.location.search.match(/msq_test=true/) ? BIDDER_URL_TEST : BIDDER_URL_PROD;
		let paramsToSearchFor = ['cpm', 'size', 'mediaType', 'currency', 'creativeId', 'adUnitCode', 'timeToRespond']
		if (bid.hasOwnProperty('mediasquare')) {
			if (bid['mediasquare'].hasOwnProperty('bidder'))
				params.push('bidder='+bid['mediasquare']['bidder']);
			if (bid['mediasquare'].hasOwnProperty('code'))
				params.push('code='+bid['mediasquare']['code']);
		};
		for (let i = 0; i < paramsToSearchFor.length; i++)
			if (bid.hasOwnProperty(paramsToSearchFor[i]))
				params.push(paramsToSearchFor[i]+'='+bid[paramsToSearchFor[i]]);
		/*if (bid.hasOwnProperty('cpm'))
			params.push('cpm='+bid['cpm']);
		if (bid.hasOwnProperty('size'))
			params.push('size='+bid['size']);*/
		if (params.length > 0)
			params = '?'+params.join('&');
		ajax(endpoint + BIDDER_ENDPOINT_WINNING+params, null);
    }

}
registerBidder(spec);
