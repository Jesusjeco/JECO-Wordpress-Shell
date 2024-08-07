/**
 * Send an action over AJAX. A wrapper around jQuery.ajax. In future, all consumers can be reviewed to simplify some of the options, where there is historical cruft.
 *
 * @param {string}   action   - the action to send
 * @param {*}        data     - data to send
 * @param {Function} callback - will be called with the results
 * @param {object}   options  -further options. Relevant properties include:
 * - [json_parse=true] - whether to JSON parse the results
 * - [alert_on_error=true] - whether to show an alert box if there was a problem (otherwise, suppress it)
 * - [action='aios_ajax'] - what to send as the action parameter on the AJAX request (N.B. action parameter to this function goes as the 'subaction' parameter on the AJAX request)
 * - [nonce=aios_ajax_nonce] - the nonce value to send.
 * - [nonce_key='nonce'] - the key value for the nonce field
 * - [timeout=null] - set a timeout after this number of seconds (or if null, none is set)
 * - [async=true] - control whether the request is asynchronous (almost always wanted) or blocking (would need to have a specific reason)
 * - [type='POST'] - GET or POST
 */
function aios_send_command(action, data, callback, options) {

	var default_options = {
		json_parse: true,
		alert_on_error: true,
		action: 'aios_ajax',
		nonce: aios_data.ajax_nonce,
		nonce_key: 'nonce',
		timeout: null,
		async: true,
		type: 'POST'
	};

	if ('undefined' === typeof options) options = {};

	for (var opt in default_options) {
		if (!options.hasOwnProperty(opt)) { options[opt] = default_options[opt]; }
	}

	var ajax_data = {
		action: options.action,
		subaction: action
	};

	ajax_data[options.nonce_key] = options.nonce;
	ajax_data.data = data;

	var ajax_opts = {
		type: options.type,
		url: ajaxurl,
		data: ajax_data,
		success: function(response, status) {
			if (options.json_parse) {
				try {
					var resp = aios_parse_json(response);
				} catch (e) {
					if ('function' == typeof options.error_callback) {
						return options.error_callback(response, e, 502, resp);
					} else {
						console.log(e);
						console.log(response);
						if (options.alert_on_error) { alert(aios_trans.unexpected_response+' '+response); }
						return;
					}
				}
				if (resp.hasOwnProperty('fatal_error')) {
					if ('function' == typeof options.error_callback) {
						// 500 is internal server error code
						return options.error_callback(response, status, 500, resp);
					} else {
						console.error(resp.fatal_error_message);
						if (options.alert_on_error) { alert(resp.fatal_error_message); }
						return false;
					}
				}
				if ('function' == typeof callback) callback(resp, status, response);
			} else {
				if ('function' == typeof callback) callback(response, status);
			}
		},
		error: function(response, status, error_code) {
			if ('function' == typeof options.error_callback) {
				options.error_callback(response, status, error_code);
			} else {
				console.log("aios_send_command: error: "+status+" ("+error_code+")");
				console.log(response);
			}
		},
		dataType: 'text',
		async: options.async
	};

	if (null != options.timeout) { ajax_opts.timeout = options.timeout; }

	jQuery.ajax(ajax_opts);

}

/**
 * Parse JSON string, including automatically detecting unwanted extra input and skipping it
 *
 * @param {string}  json_mix_str - JSON string which need to parse and convert to object
 * @param {boolean} analyse		 - if true, then the return format will contain information on the parsing, and parsing will skip attempting to JSON.parse() the entire string (will begin with trying to locate the actual JSON)
 *
 * @throws SyntaxError|String (including passing on what JSON.parse may throw) if a parsing error occurs.
 *
 * @returns Mixed parsed JSON object. Will only return if parsing is successful (otherwise, will throw). If analyse is true, then will rather return an object with properties (mixed)parsed, (integer)json_start_pos and (integer)json_end_pos
 */
function aios_parse_json(json_mix_str, analyse) {

	analyse = ('undefined' === typeof analyse) ? false : true;

	// Just try it - i.e. the 'default' case where things work (which can include extra whitespace/line-feeds, and simple strings, etc.).
	if (!analyse) {
		try {
			var result = JSON.parse(json_mix_str);
			return result;
		} catch (e) {
			console.log('AIOS: Exception when trying to parse JSON (1) - will attempt to fix/re-parse based upon first/last curly brackets');
			console.log(json_mix_str);
		}
	}

	var json_start_pos = json_mix_str.indexOf('{');
	var json_last_pos = json_mix_str.lastIndexOf('}');

	// Case where some php notice may be added after or before json string
	if (json_start_pos > -1 && json_last_pos > -1) {
		var json_str = json_mix_str.slice(json_start_pos, json_last_pos + 1);
		try {
			var parsed = JSON.parse(json_str);
			if (!analyse) { console.log('AIOS: JSON re-parse successful'); }
			return analyse ? { parsed: parsed, json_start_pos: json_start_pos, json_last_pos: json_last_pos + 1 } : parsed;
		} catch (e) {
			console.log('AIOS: Exception when trying to parse JSON (2) - will attempt to fix/re-parse based upon bracket counting');

			var cursor = json_start_pos;
			var open_count = 0;
			var last_character = '';
			var inside_string = false;

			// Don't mistake this for a real JSON parser. Its aim is to improve the odds in real-world cases seen, not to arrive at universal perfection.
			while ((open_count > 0 || cursor == json_start_pos) && cursor <= json_last_pos) {

				var current_character = json_mix_str.charAt(cursor);

				if (!inside_string && '{' == current_character) {
					open_count++;
				} else if (!inside_string && '}' == current_character) {
					open_count--;
				} else if ('"' == current_character && '\\' != last_character) {
					inside_string = inside_string ? false : true;
				}

				last_character = current_character;
				cursor++;
			}
			console.log("Started at cursor="+json_start_pos+", ended at cursor="+cursor+" with result following:");
			console.log(json_mix_str.substring(json_start_pos, cursor));

			try {
				var parsed = JSON.parse(json_mix_str.substring(json_start_pos, cursor));
				console.log('AIOS: JSON re-parse successful');
				return analyse ? { parsed: parsed, json_start_pos: json_start_pos, json_last_pos: cursor } : parsed;
			} catch (e) {
				// Throw it again, so that our function works just like JSON.parse() in its behaviour.
				throw e;
			}
		}
	}

	throw "AIOS: could not parse the JSON";

}

/**
 * Updates the content of an HTML element identified by its ID with the provided badge text.
 *
 * @param {Array} badges - An array of objects representing badges to update.
 * @param {string} badges.id - The ID of the HTML element to update.
 * @param {string} badges.html - The HTML content to set for the element.
 * @returns {void}
 */
function aios_update_badge(badges) {
	badges.forEach(function(badge) {
		aios_update_content(badge.id, badge.html);
	});
}

/**
 * Update the content of an element with the specified HTML.
 *
 * @param {string} id - The ID of the element to update.
 * @param {string} html - The HTML content to set for the element.
 * @returns {void}
 */
function aios_update_content(id, html) {
	jQuery(id).html(html);
}


/**
 * Function to block the UI and display a loading message.
 * Uses jQuery blockUI plugin.
 *
 * @param {string} message - A string to be shown when function is called
 *
 * @returns {void}
 */
function aios_block_ui(message = aios_trans.saving) {
	jQuery.blockUI({
		css: {
			width: '500px',
			border: 'none',
			'border-radius': '10px',
			left: 'calc(50% - 250px)',
			top: 'calc(50% - 150px)',
			padding: '20px'
		},
		message: '<div style="margin: 8px; font-size:150%;" class="aios_saving_popup"><img src="' + aios_trans.logo + '" height="80" width="80" style="padding-bottom:10px;"><br>' + message + '</div>'
	});
}

/**
 * Display a success modal with optional message and icon.
 *
 * @param {Object|string} args - Configuration object or message string.
 * @param {boolean} close_popup - Optional. If true, the popup will close automatically after 2 seconds. Default is true.
 *
 * @returns {void}
 */
function aios_show_success_modal(args, close_popup = true) {
	if ('string' == typeof args) {
		args = {
			message: args
		};
	}
	var data = jQuery.extend(
		{
			icon: 'yes',
			close: aios_trans.close,
			message: '',
			classes: 'success'
		},
		args
	);

	var closeButtonHTML = '';
	if (!close_popup) {
		closeButtonHTML = '<button class="button aios-close-overlay"><span class="dashicons dashicons-no-alt"></span>' + data.close + '</button>';
	}

	jQuery.blockUI({
		css: {
			width: '500px',
			border: 'none',
			'border-radius': '10px',
			left: 'calc(50% - 250px)',
			top: 'calc(50% - 150px)',
			cursor: 'default'
		},
		onOverlayClick: jQuery.unblockUI,
		message: '<div class="aios_success_popup ' + data.classes + '"><span class="dashicons dashicons-' + data.icon + '"></span><div class="aios_success_popup--message">' + data.message + '</div>' + closeButtonHTML + '</div>'
	});

	// close success popup
	jQuery('.blockUI .aios-close-overlay').on('click', function() {
		jQuery.unblockUI();
	});

	if (close_popup) {
		setTimeout(function () {
			jQuery.unblockUI();
		}, 2000);
	}
}

/**
 * Submits a form using AJAX and handles the response.
 *
 * @param {jQuery} form - The jQuery object representing the form element.
 * @param {string} action - The action to perform when submitting the form.
 * @param {boolean|Object} [use_data=true] - Indicates whether to include form data in the AJAX request.
 * @param {string} [block_ui_message="Saving..."] - The message to display while blocking UI during AJAX request.
 * @param {Function} [pre_ajax_callback] - Optional callback function to execute before the AJAX request.
 * @param {Function} [post_ajax_callback] - Optional callback function to execute after the AJAX request.
 */
function aios_submit_form(form, action, use_data = true, block_ui_message = aios_trans.saving, pre_ajax_callback, post_ajax_callback ) {
	aios_block_ui(block_ui_message);
	var submitButton = form.find(':submit');
	submitButton.prop('disabled', true);
	var data = {};

	if ('function' === typeof pre_ajax_callback) {
		pre_ajax_callback();
	}

	if ('object' === typeof use_data) {
		data = use_data; // Use custom data object
	} else if (use_data) {
		var dataArray = form.serializeArray();
		var dataLength = dataArray.length;
		for (var i = 0; i < dataLength; i++) {
			data[dataArray[i].name] = dataArray[i].value;
		}
	}
	aios_send_command(action, data, function(response) {
		aios_handle_ajax_update(response, post_ajax_callback);
		submitButton.prop('disabled', false);
	});
}

/**
 * Handle AJAX response and update UI elements accordingly.
 * If a callback function is provided, it will be executed.
 *
 * @param {Object} response - The AJAX response object.
 * @param {Function} [callback] - Optional callback function to execute.
 *
 * @returns {void}
 */
function aios_handle_ajax_update(response, callback) {

	var update_message = (response.hasOwnProperty('message') && response.message.length > 0) || (response.hasOwnProperty('info') && response.info.length > 0);

	if (update_message) {
		var messageContainer = jQuery('<div></div>');
		var close_popup = true;

		// display single message
		if (response.hasOwnProperty('message')) {
			messageContainer.append(response.message);
			messageContainer.append('<br>');
		}

		if (response.hasOwnProperty('info') && response.info.length > 0) {
			close_popup = false;
			// info toggle
			let toggle = jQuery('<span>' + aios_trans.show_notices + ' (<a href="#" id="aios_ajax_showmoreoptions">' + aios_trans.show_info + '</a>)</span>');
			toggle.appendTo(messageContainer);


			let infoContainer = jQuery('<div id="aios_ajax_moreoptions" class="aiowps_more_info_body" style="display:none;"></div>');
			response.info.forEach(function (info) {
				infoContainer.append(`<span class="aios-modal-info">${info}</span>`, '<br>');
			});

			infoContainer.appendTo(messageContainer);
		}


		if ('error' === response.status) {
			aios_show_success_modal({
				message: messageContainer.html(),
				icon: 'no-alt',
				classes: 'warning'
			}, false);
		} else {
			aios_show_success_modal(messageContainer.html(), close_popup);
		}
	} else {
		jQuery.unblockUI();
	}

	// update contents on the page
	if (response.hasOwnProperty('content')) {
		jQuery.each(response.content, function(key, value) {
			aios_update_content('#' + key, value);
		});
	}

	// update fields with new values if changed
	if (response.hasOwnProperty('values')) {
		jQuery.each(response.values, function(key, value) {
			jQuery('#' + key).val(value);
		});
	}

	// update badges
	if (response.hasOwnProperty('badges')) {
		aios_update_badge(response.badges);
	}

	if ('function' === typeof callback) {
		callback(response);
	}
}

jQuery(function($) {
	//Add Generic Admin Dashboard JS Code in this file

	//Media Uploader - start
	jQuery("#aiowps_restore_htaccess_form").on('submit', function(e) {
		e.preventDefault();
		aios_read_restore_file(this, 'htaccess');
	});

	jQuery("#aiowps_restore_wp_config_form").on('submit', function(e) {
		e.preventDefault();
		aios_read_restore_file(this, 'wp_config');
	});

	jQuery("#aiowps_restore_settings_form").on('submit', function(e) {
		e.preventDefault();
		aios_read_restore_file(this, 'import_settings');
	});
	/**
	 * Reads the contents of a selected file and submits the form after populating a hidden input with the file contents.
	 *
	 * @param {HTMLFormElement} form - The form element to submit after reading the file contents.
	 * @param {string} 			file - The type of file to read ('htaccess', 'wp_config', 'import_settings').
	 */
	function aios_read_restore_file(form, file) {
		var aios_import_file_input = document.getElementById('aiowps_' + file + '_file');
		if (0 == aios_import_file_input.files.length) {
			alert(aios_trans.no_import_file);
			return;
		}
		var aios_import_file_file = aios_import_file_input.files[0];
		var aios_import_file_reader = new FileReader();
		aios_import_file_reader.onload = function() {
			jQuery('#aiowps_' + file + '_file_contents').val(this.result);
			form.submit();
		};
		aios_import_file_reader.readAsText(aios_import_file_file);
	}
	//End of Media Uploader
	
	// Triggers the more info toggle link
	jQuery(".aiowps_more_info_body").hide();//hide the more info on page load
	function toggleMoreInfo() {
		jQuery('.aiowps_more_info_anchor').on('click', function () {
			jQuery(this).next(".aiowps_more_info_body").animate({"height": "toggle"});
			var toggle_char_ref = jQuery(this).find(".aiowps_more_info_toggle_char");
			var toggle_char_value = toggle_char_ref.text();
			if ("+" === toggle_char_value) {
				toggle_char_ref.text("-");
			} else {
				toggle_char_ref.text("+");
			}
		});
	}
	toggleMoreInfo();
	//End of more info toggle

	/**
	 * This function uses javascript to retrieve a query arg from the current page URL
	 *
	 * @param {string} name - The name of the query parameter to retrieve.
	 * @returns {string|null} The value of the query parameter, or null if the parameter does not exist.
	 */
	function getParameterByName(name) {
		var url = window.location.href;
		name = name.replace(/[\[\]]/g, "\\$&");
		var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
			results = regex.exec(url);
		if (!results) return null;
		if (!results[2]) return '';
		return decodeURIComponent(results[2].replace(/\+/g, " "));
	}

	// Start of brute force attack prevention toggle handling
	jQuery('input[name=aiowps_enable_brute_force_attack_prevention]').on('click', function() {
		jQuery('input[name=aiowps_brute_force_secret_word]').prop('disabled', !jQuery(this).prop('checked'));
		jQuery('input[name=aiowps_cookie_based_brute_force_redirect_url]').prop('disabled', !jQuery(this).prop('checked'));
		jQuery('input[name=aiowps_brute_force_attack_prevention_pw_protected_exception]').prop('disabled', !jQuery(this).prop('checked'));
		jQuery('input[name=aiowps_brute_force_attack_prevention_ajax_exception]').prop('disabled', !jQuery(this).prop('checked'));
	});
	// End of brute force attack prevention toggle handling

	// Start of CAPTCHA handling
	jQuery('.wrap').on('change', '#aiowps_default_captcha', function () {
		var selected_captcha = jQuery(this).val();
		jQuery('.captcha_settings').hide();
		jQuery('#aios-'+ selected_captcha).show();
		
		if ('none' === selected_captcha) {
			jQuery('#aios-captcha-options').hide();
		} else {
			jQuery('#aios-captcha-options').show();
		}
	});
	// End of CAPTCHA handling

	/**
	 * Take a backup with UpdraftPlus if possible.
	 *
	 * @param {String}   file_entities
	 *
	 * @return void
	 */
	function take_a_backup_with_updraftplus(file_entities) {
		// Set default for file_entities to empty string
		if ('undefined' == typeof file_entities) file_entities = '';
		var exclude_files = file_entities ? 0 : 1;

		if ('function' === typeof updraft_backupnow_inpage_go) {
			updraft_backupnow_inpage_go(function () {
				// Close the backup dialogue.
				jQuery('#updraft-backupnow-inpage-modal').dialog('close');
			}, file_entities, 'autobackup', 0, exclude_files, 0);
		}
	}

	if (jQuery('#aios-manual-db-backup-now').length) {
		jQuery('#aios-manual-db-backup-now').on('click', function (e) {
			e.preventDefault();
			take_a_backup_with_updraftplus();
		});
	}

	// Hide 2FA premium section (advertisements) for free.
	if (jQuery('.tfa-premium').length && 0 == jQuery('#tfa_trusted_for').length) {
		jQuery('.tfa-premium').parent().find('hr').first().hide();
		jQuery('.tfa-premium').hide();
	}

	// Start of trash spam comments toggle handling
	jQuery('input[name=aiowps_enable_trash_spam_comments]').on('click', function() {
		jQuery('input[name=aiowps_trash_spam_comments_after_days]').prop('disabled', !jQuery(this).prop('checked'));
	});
	// End of trash spam comments toggle handling

	/**
	 * Copies text to the clipboard using the deprecated document.execCommand method.
	 *
	 * @param {string} text - The text to be copied to the clipboard.
	 */
	function deprecated_copy(text) {
		var $temp = jQuery('<input>');
		jQuery('body').append($temp);
		$temp.val(text).select();
		if (document.execCommand('copy')) {
			alert(aios_trans.copied);
		}
		$temp.remove();
	}

	// Start of copy-to-clipboard click handling
	jQuery('.copy-to-clipboard').on('click', function(event) {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(event.target.value).then(function() {
					alert(aios_trans.copied);
				}, function() {
					deprecated_copy(event.target.value);
			});
		} else {
			deprecated_copy(event.target.value);
		}
	});
	// End of copy-to-clipboard click handling

	// Start of database table prefix handling
	jQuery('#aiowps_enable_random_prefix').on('click', function() {
		jQuery('#aiowps_new_manual_db_prefix').prop('disabled', jQuery(this).prop('checked'));
	});

	jQuery('#aiowps_new_manual_db_prefix').on('input', function() {
		if (jQuery(this).prop('value')) {
			jQuery('#aiowps_enable_random_prefix').prop('disabled', true);
		} else {
			jQuery('#aiowps_enable_random_prefix').prop('disabled', false);
		}
	});
	// End of database table prefix handling

	// Dashboard menu ajaxify
	jQuery("#locked-ip-list-table").on('click', '.aios-unlock-ip-button', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('unlock_ip', {ip: jQuery(this).data('ip')}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#locked-ip-list-table').load(' #locked-ip-list-table > *');
		}) : false;
	});

	jQuery("#locked-ip-list-table").on('click', '.aios-delete-locked-ip-record', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('delete_locked_ip_record', {id: jQuery(this).data('id')}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#locked-ip-list-table').load(' #locked-ip-list-table > *');
		}) : false;
	});

	jQuery("#permanent-ip-list-table").on('click', '.aios-unblock-permanent-ip', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('blocked_ip_list_unblock_ip', {id: jQuery(this).data('id')}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#permanent-ip-list-table').load(' #permanent-ip-list-table > *');
		}) : false;
	});

	jQuery("#audit-log-list-table").on('click', '.aios-delete-audit-log', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('delete_audit_log', {id: jQuery(this).data('id')}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#audit-log-list-table').load(' #audit-log-list-table > *');
		}) : false;
	});

	jQuery("#audit-log-list-table").on('click', '.aios-unlock-ip-button', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('unlock_ip', {ip: jQuery(this).data('ip')}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#audit-log-list-table').load(' #audit-log-list-table > *');
		}) : false;
	});

	jQuery("#audit-log-list-table").on('click', '.aios-unblacklist-ip-button', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('unblacklist_ip', {ip: jQuery(this).data('ip')}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#audit-log-list-table').load(' #audit-log-list-table > *');
		}) : false;
	});

	jQuery("#audit-log-list-table").on('click', '.aios-lock-ip-button', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('lock_ip', {ip: jQuery(this).data('ip'), lock_reason: 'audit-log'}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#audit-log-list-table').load(' #audit-log-list-table > *');
		}) : false;
	});

	jQuery("#audit-log-list-table").on('click', '.aios-blacklist-ip-button', function(e) {
		e.preventDefault();
		confirm(jQuery(this).data('message')) ? aios_send_command('blacklist_ip', {ip: jQuery(this).data('ip')}, function(response) {
			jQuery('#aios_message').remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.message);
			if ('success' === response.status) jQuery('#audit-log-list-table').load(' #audit-log-list-table > *');
		}) : false;
	});

	jQuery("#aios-clear-debug-logs").on('click', '.aios-clear-debug-logs', function(e) {
		e.preventDefault();
		if (confirm(jQuery(this).data('message'))) {
			aios_send_command('clear_debug_logs', {}, function(response) {
				jQuery('#aios_message').remove();
				jQuery('#wpbody-content .wrap h2:first').after(response.message);
				if ("success" === response.status) $('#debug-list-table').load(' #debug-list-table > *');
			});
		}
	});
	// End of dashboard menu ajaxify

	// Firewall menu ajaxify
	jQuery('#aios-php-firewall-settings-form').on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this), 'perform_php_firewall_settings', true, aios_trans.saving, null, function(response) {
			if ("success" === response.status) {
				jQuery('.aio_orange_box').remove();
				jQuery('#post-body h2:first').after(response.xmlprc_warning);
			}
		});
	});

	jQuery('#aios-htaccess-firewall-settings-form').on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this),'perform_htaccess_firewall_settings');
	});

	jQuery("#aios-rest-api-settings-form").on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this),'perform_save_wp_rest_api_settings');
	});

	jQuery("#aios-blacklist-settings-form").on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this),'perform_save_blacklist_settings');
	});

	jQuery("#aios-internet-bots-settings-form").on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this),'perform_internet_bot_settings');
	});

	jQuery("#aios-firewall-allowlist-form").on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this),'perform_firewall_allowlist');
	});

	jQuery("#aios-6g-firewall-settings-form").on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this), 'perform_xG_firewall_settings', true, aios_trans.saving, null, function(response) {
			if ("success" === response.status) {
				var aiowps_enable_6g_firewall = jQuery('#aiowps_enable_6g_firewall').prop('checked');
				if (aiowps_enable_6g_firewall) {
					jQuery('.aios-toggle-advanced-options').removeClass('advanced-options-disabled');
					jQuery('.aiowps_more_info_body').hide();
				} else {
					jQuery('.aios-toggle-advanced-options').addClass('advanced-options-disabled');
					jQuery('.button.button-link.aios-toggle-advanced-options').removeClass('opened');
				}
			}
		})
	});

	jQuery('#aiowps-firewall-status-container').on('submit', "#aiowpsec-firewall-setup-form", function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this), 'perform_setup_firewall', true, aios_trans.setting_up_firewall, null, function (response) {
			jQuery("#aios-firewall-setup-notice").remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.info_box);
		});
	});

	jQuery('#aiowps-firewall-status-container').on('submit', "#aiowps-firewall-downgrade-form", function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this), 'perform_downgrade_firewall', true, aios_trans.downgrading_firewall, null, function (response) {
			jQuery("#aios-firewall-installed-notice").remove();
			jQuery('#wpbody-content .wrap h2:first').after(response.info_box);
		});
	});
	// end of firewall menu ajax

	// Start of file scan handling
	jQuery('.aiowps_next_scheduled_scan_wrapper').on('click', '.aiowps_view_last_fcd_results', view_scan_results_handler);
	jQuery('#aiowps_fcds_change_detected').on('click', '.aiowps_view_last_fcd_results', view_scan_results_handler);

	// start of tools menu ajaxify
	jQuery("#aiowpsec-whois-lookup-form").on('submit', function(e) {
		e.preventDefault();

		jQuery('#aios-who-is-lookup-result-container').html('');

		aios_submit_form(jQuery(this), 'perform_whois_lookup', true, aios_trans.processing, null, function () {
			var targetOffset = jQuery('#aios-who-is-lookup-result-container').offset().top;
			jQuery('html, body').animate({ scrollTop: targetOffset }, 'slow');
		});
	});

	jQuery("#aiowpsec-site-lockout-form").on('submit', function (e) {
		e.preventDefault();
		aios_submit_form(jQuery(this), 'perform_general_visitor_lockout', true, aios_trans.saving, function () {
			var editor = tinyMCE.get('aiowps_site_lockout_msg_editor_content');
			if (editor) {
				editor.save();
			}
		});
	});

	jQuery("#aiowpsec-save-custom-rules-settings-form").on('submit', function (e) {
		e.preventDefault();
		aios_submit_form(jQuery(this), 'perform_store_custom_htaccess_settings');
	});
	// end  of tools menu ajaxify
	jQuery('#aiowpsec-scheduled-fcd-scan-form').on('submit', function(e) {
		e.preventDefault();
		aios_submit_form(jQuery(this), 'perform_save_file_detection_change_settings');
	});

	/**
	 * This function handles the view last scan result event
	 *
	 * @param {*} e - the event
	 */
	function view_scan_results_handler(e) {
		e.preventDefault();
		
		var reset_change_detected = jQuery(this).data('reset_change_detected') ? 1 : 0;

		aios_submit_form(jQuery(this), 'get_last_scan_results', { reset_change_detected: reset_change_detected}, aios_trans.processing, null, function (response) {
			if (reset_change_detected) jQuery('#aiowps_fcds_change_detected').remove();
			var targetOffset = jQuery('#aiowps_previous_scan_wrapper').offset().top;
			jQuery('html, body').animate({ scrollTop: targetOffset }, 'slow');
		})
	}

	jQuery('#aiowps_manual_fcd_scan').on('click', function(e) {
		e.preventDefault();

		aios_submit_form(jQuery(this), 'perform_file_scan', true, aios_trans.scanning, function () {
			jQuery('#aiowps_activejobs_table').html('<p><span class="aiowps_spinner spinner">'+ aios_trans.processing + '</span></p>');
			jQuery('#aiowps_activejobs_table .aiowps_spinner').addClass('visible');
			}, function (response) {
				jQuery('#aiowps_activejobs_table').html('');
				if (response.hasOwnProperty('result')) {
					jQuery('#aiowps_activejobs_table').append('<p>'+response.result+'</p>');
				}
		});
	});
	// End of file scan handling
	
	// Start of login whitelist suggests both IPv4 and IPv6
	if (jQuery('#aios_user_ip_maybe_also').length) {
		var selector = '#aios-ipify-ip-address';
		var ipfield = '#aios_user_ip_maybe_also';
		var getting_text = jQuery(ipfield).attr('getting_text');
		var ip_maybe = jQuery(ipfield).attr('ip_maybe');
		if ('v6' == ip_maybe) {
			var url = 'https://api64.ipify.org/?format=json';
		} else {
			var url = 'https://api.ipify.org/?format=json';
		}
		jQuery(selector).html(getting_text);
		jQuery.ajax({
			type: 'GET',
			dataType: 'json',
			url: url,
			success: function (response, status) {
				if (response.hasOwnProperty('ip') && response.ip != jQuery('#aiowps_user_ip').val()) {
					jQuery(ipfield).val(response.ip);
					jQuery(ipfield).removeClass('aio_hidden');
				} else {
					console.log(response);
				}
				jQuery(selector).html('');
			},
			error: function (response, status, error_code) {
				console.log(response);
				jQuery(selector).html('');
			}
		});
	}
	// End of login whitelist suggests both IPv4 and IPv6

	// Click the 'show/hide advanced options' button
	jQuery('button.button-link.aios-toggle-advanced-options').on('click', function() {
		if (!jQuery(this).hasClass('advanced-options-disabled')) {
			jQuery(this).toggleClass('opened');
		}
	});

	// click the show more for AJAX info
	jQuery(document).on('click','#aios_ajax_showmoreoptions', function (e) {
		e.preventDefault();
		let moreOptions = jQuery('#aios_ajax_moreoptions');
		moreOptions.toggle();
		// Toggle text between "Show more" and "Hide"
		let newText = moreOptions.is(':visible') ? aios_trans.hide_info : aios_trans.show_info;
		jQuery(this).text(newText);
	});
});
